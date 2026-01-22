from __future__ import annotations

import csv
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.db.session import get_db
from app.models.column_mapping import ColumnMapping
from app.models.fact_marketing_spend import FactMarketingSpend
from app.models.fact_transaction import FactTransaction
from app.models.project import Project
from app.models.upload import Upload, UploadStatus, UploadType
from app.schemas.uploads import (
    ColumnMappingCreate,
    ColumnMappingPublic,
    ImportResult,
    QualityIssue,
    QualityReport,
    QualityStats,
    UploadPreview,
)
from app.services.upload_pipeline import (
    build_field_mapping,
    get_row_value,
    normalize_value,
    parse_date,
    parse_float,
    read_upload_rows,
)
from app.services.insights import generate_insights_for_project
from app.services.aliases import (
    get_manager_name,
    get_product_name,
    resolve_manager_alias,
    resolve_product_alias,
)

router = APIRouter(prefix="/uploads", tags=["upload-mapping"])

REQUIRED_FIELDS: dict[UploadType, list[str]] = {
    UploadType.TRANSACTIONS: [
        "order_id",
        "date",
        "operation_type",
        "amount",
        "client_id",
        "product_name",
        "product_category",
        "manager",
    ],
    UploadType.MARKETING_SPEND: ["date", "spend_amount"],
}

SUGGESTION_RULES: dict[str, list[str]] = {
    "order_id": ["order_id", "order id", "id заказа", "номер заказа", "заказ"],
    "date": ["date", "дата", "transaction date", "payment date", "дата операции"],
    "operation_type": ["operation_type", "operation type", "тип операции", "operation"],
    "amount": ["amount", "sum", "сумма", "стоимость", "оплата"],
    "client_id": ["client_id", "client id", "customer_id", "id клиента", "клиент"],
    "product_name": ["product", "product_name", "название товара", "наименование"],
    "product_category": ["category", "product_category", "категория", "группа"],
    "manager": ["manager", "sales", "менеджер", "продавец"],
    "spend_amount": [
        "spend",
        "spend_amount",
        "cost",
        "расход",
        "затраты",
        "budget",
    ],
}

DATE_FORMATS = ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%Y/%m/%d", "%Y.%m.%d")


def _get_upload(upload_id: int, current_user: CurrentUser, db: Session) -> Upload:
    upload = db.scalar(
        select(Upload)
        .join(Project, Upload.project_id == Project.id)
        .where(Upload.id == upload_id, Project.owner_id == current_user.id)
    )
    if not upload:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Загрузка не найдена.",
        )
    return upload


def _normalize_header(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9а-я]+", " ", value.lower())
    return re.sub(r"\s+", " ", normalized).strip()


def _serialize_cell(value: object) -> object:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value if value is not None else ""


def _infer_type(values: Iterable[object]) -> str:
    cleaned = [value for value in values if value not in (None, "")]
    if not cleaned:
        return "string"

    if all(_is_date(value) for value in cleaned):
        return "date"
    if all(_is_int(value) for value in cleaned):
        return "integer"
    if all(_is_float(value) for value in cleaned):
        return "float"
    return "string"


def _is_date(value: object) -> bool:
    if isinstance(value, (datetime, date)):
        return True
    if isinstance(value, str):
        for fmt in DATE_FORMATS:
            try:
                datetime.strptime(value.strip(), fmt)
                return True
            except ValueError:
                continue
    return False


def _is_int(value: object) -> bool:
    if isinstance(value, int) and not isinstance(value, bool):
        return True
    if isinstance(value, str):
        return bool(re.fullmatch(r"-?\d+", value.strip()))
    return False


def _is_float(value: object) -> bool:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return True
    if isinstance(value, str):
        return bool(re.fullmatch(r"-?\d+[.,]?\d*", value.strip()))
    return False


def _read_csv_preview(file_path: Path) -> tuple[list[str], list[list[object]]]:
    with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
        sample = handle.read(4096)
        handle.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        reader = csv.reader(handle, dialect)
        headers = next(reader, [])
        rows: list[list[object]] = []
        for row in reader:
            rows.append([_serialize_cell(value) for value in row])
            if len(rows) >= 20:
                break
    return headers, rows


def _read_xlsx_preview(file_path: Path) -> tuple[list[str], list[list[object]]]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Для предпросмотра XLSX установите зависимость openpyxl.",
        ) from exc

    workbook = load_workbook(file_path, read_only=True, data_only=True)
    sheet = workbook.active
    rows_iter = sheet.iter_rows(values_only=True)
    headers_row = next(rows_iter, None)
    headers = [str(value) if value is not None else "" for value in (headers_row or [])]
    rows: list[list[object]] = []
    for row in rows_iter:
        rows.append([_serialize_cell(value) for value in row])
        if len(rows) >= 20:
            break
    workbook.close()
    return headers, rows


def _preview_from_upload(upload: Upload) -> tuple[list[str], list[list[object]]]:
    file_path = Path(upload.file_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Файл загрузки не найден.",
        )
    if file_path.suffix.lower() == ".xlsx":
        return _read_xlsx_preview(file_path)
    return _read_csv_preview(file_path)


def _build_mapping_suggestions(
    headers: list[str],
    upload_type: UploadType,
) -> dict[str, str | None]:
    available_fields = set(REQUIRED_FIELDS[upload_type])
    suggestions: dict[str, str | None] = {}
    for header in headers:
        normalized = _normalize_header(header)
        matched = None
        for field, keywords in SUGGESTION_RULES.items():
            if field not in available_fields:
                continue
            if any(keyword in normalized for keyword in keywords):
                matched = field
                break
        suggestions[header] = matched
    return suggestions


def _get_mapping(upload_id: int, db: Session) -> ColumnMapping:
    mapping = db.get(ColumnMapping, upload_id)
    if not mapping:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сначала сохраните маппинг колонок.",
        )
    return mapping


def _stringify(value: object) -> str:
    if value is None:
        return ""
    return str(value)


def _build_quality_report(
    upload: Upload,
    mapping: ColumnMapping,
) -> tuple[QualityReport, list[dict[str, object]]]:
    headers, rows = read_upload_rows(upload)
    header_index = {header: index for index, header in enumerate(headers)}
    field_to_header = build_field_mapping(mapping.mapping_json)
    normalization = mapping.normalization_json or {}
    required_fields = REQUIRED_FIELDS[upload.type]

    errors: list[QualityIssue] = []
    warnings: list[QualityIssue] = []
    rows_with_errors: set[int] = set()
    normalized_rows: list[dict[str, object]] = []

    seen_orders: set[str] = set()

    for row_index, row in enumerate(rows, start=2):
        row_has_error = False
        row_payload: dict[str, object] = {}

        for field in required_fields:
            header = field_to_header.get(field, "")
            raw_value = get_row_value(row, header_index, header) if header else ""
            normalized_value = normalize_value(raw_value, normalization.get(header))
            row_payload[field] = {
                "raw": _stringify(raw_value),
                "normalized": normalized_value,
                "header": header,
            }
            if normalized_value in ("", None):
                errors.append(
                    QualityIssue(
                        row=row_index,
                        field=field,
                        message="Поле обязательно для заполнения.",
                    )
                )
                row_has_error = True

        if upload.type == UploadType.TRANSACTIONS:
            order_id = row_payload.get("order_id", {}).get("normalized", "")
            if order_id:
                order_id_str = _stringify(order_id)
                if order_id_str in seen_orders:
                    warnings.append(
                        QualityIssue(
                            row=row_index,
                            field="order_id",
                            message="Повторяющийся order_id.",
                        )
                    )
                else:
                    seen_orders.add(order_id_str)

            date_value = parse_date(
                row_payload.get("date", {}).get("raw", "")
            )
            if not date_value:
                errors.append(
                    QualityIssue(
                        row=row_index,
                        field="date",
                        message="Дата не распознана.",
                    )
                )
                row_has_error = True

            amount_value = parse_float(
                row_payload.get("amount", {}).get("raw", "")
            )
            if amount_value is None or amount_value <= 0:
                errors.append(
                    QualityIssue(
                        row=row_index,
                        field="amount",
                        message="Сумма должна быть больше 0.",
                    )
                )
                row_has_error = True

            operation_value = _stringify(
                row_payload.get("operation_type", {}).get("normalized", "")
            ).lower()
            if operation_value not in {"sale", "refund"}:
                errors.append(
                    QualityIssue(
                        row=row_index,
                        field="operation_type",
                        message="Тип операции должен быть sale или refund.",
                    )
                )
                row_has_error = True

            if not row_has_error:
                row_payload["date_parsed"] = date_value
                row_payload["amount_parsed"] = amount_value
                row_payload["operation_type_norm"] = operation_value
        else:
            date_value = parse_date(
                row_payload.get("date", {}).get("raw", "")
            )
            if not date_value:
                errors.append(
                    QualityIssue(
                        row=row_index,
                        field="date",
                        message="Дата не распознана.",
                    )
                )
                row_has_error = True

            spend_value = parse_float(
                row_payload.get("spend_amount", {}).get("raw", "")
            )
            if spend_value is None or spend_value <= 0:
                errors.append(
                    QualityIssue(
                        row=row_index,
                        field="spend_amount",
                        message="Сумма должна быть больше 0.",
                    )
                )
                row_has_error = True

            if not row_has_error:
                row_payload["date_parsed"] = date_value
                row_payload["spend_amount_parsed"] = spend_value

        if row_has_error:
            rows_with_errors.add(row_index)
        else:
            normalized_rows.append(row_payload)

    report = QualityReport(
        errors=errors,
        warnings=warnings,
        stats=QualityStats(
            total_rows=len(rows),
            valid_rows=len(rows) - len(rows_with_errors),
            error_count=len(errors),
            warning_count=len(warnings),
        ),
    )
    return report, normalized_rows


@router.get("/{upload_id}/preview", response_model=UploadPreview)
def preview_upload(
    upload_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> UploadPreview:
    upload = _get_upload(upload_id, current_user, db)
    headers, sample_rows = _preview_from_upload(upload)
    inferred_types = {
        header: _infer_type(row[index] if index < len(row) else "" for row in sample_rows)
        for index, header in enumerate(headers)
    }
    mapping_suggestions = _build_mapping_suggestions(headers, upload.type)
    return UploadPreview(
        headers=headers,
        sample_rows=sample_rows,
        inferred_types=inferred_types,
        mapping_suggestions=mapping_suggestions,
        upload_type=upload.type,
    )


@router.post(
    "/{upload_id}/mapping",
    response_model=ColumnMappingPublic,
    status_code=status.HTTP_201_CREATED,
)
def save_mapping(
    upload_id: int,
    payload: ColumnMappingCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ColumnMappingPublic:
    upload = _get_upload(upload_id, current_user, db)
    required_fields = REQUIRED_FIELDS[upload.type]
    selected_fields = {value for value in payload.mapping.values() if value}
    missing = [field for field in required_fields if field not in selected_fields]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Не заполнены обязательные поля: {', '.join(missing)}.",
        )

    mapping = db.get(ColumnMapping, upload_id)
    normalization = payload.normalization or {}
    if mapping:
        mapping.mapping_json = payload.mapping
        mapping.normalization_json = normalization
        mapping.created_at = datetime.now(timezone.utc)
    else:
        mapping = ColumnMapping(
            upload_id=upload_id,
            mapping_json=payload.mapping,
            normalization_json=normalization,
        )
        db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return ColumnMappingPublic.model_validate(mapping)


@router.post("/{upload_id}/validate", response_model=QualityReport)
def validate_upload(
    upload_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> QualityReport:
    upload = _get_upload(upload_id, current_user, db)
    mapping = _get_mapping(upload_id, db)
    report, _ = _build_quality_report(upload, mapping)
    upload.status = UploadStatus.VALIDATED if not report.errors else UploadStatus.FAILED
    db.commit()
    return report


@router.post("/{upload_id}/import", response_model=ImportResult)
def import_upload(
    upload_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ImportResult:
    upload = _get_upload(upload_id, current_user, db)
    mapping = _get_mapping(upload_id, db)
    report, normalized_rows = _build_quality_report(upload, mapping)
    if report.errors:
        upload.status = UploadStatus.FAILED
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Импорт невозможен из-за ошибок в данных.",
                "report": report.model_dump(),
            },
        )

    inserted = 0
    normalization = mapping.normalization_json or {}
    field_to_header = build_field_mapping(mapping.mapping_json)
    for row_payload in normalized_rows:
        if upload.type == UploadType.TRANSACTIONS:
            product_header = field_to_header.get("product_name", "")
            manager_header = field_to_header.get("manager", "")
            product_raw = row_payload.get("product_name", {}).get("raw", "")
            manager_raw = row_payload.get("manager", {}).get("raw", "")
            product_key = normalize_value(
                product_raw, normalization.get(product_header)
            )
            manager_key = normalize_value(
                manager_raw, normalization.get(manager_header)
            )
            product_id = resolve_product_alias(
                db, upload.project_id, _stringify(product_key)
            )
            manager_id = resolve_manager_alias(
                db, upload.project_id, _stringify(manager_key)
            )
            product_norm = (
                get_product_name(db, product_id)
                if product_id
                else _stringify(product_key)
            )
            manager_norm = (
                get_manager_name(db, manager_id)
                if manager_id
                else _stringify(manager_key)
            )
            record = FactTransaction(
                project_id=upload.project_id,
                order_id=_stringify(
                    row_payload.get("order_id", {}).get("normalized", "")
                ),
                date=row_payload.get("date_parsed"),
                operation_type=row_payload.get("operation_type_norm"),
                amount=row_payload.get("amount_parsed"),
                client_id=_stringify(
                    row_payload.get("client_id", {}).get("normalized", "")
                ),
                product_name_raw=_stringify(product_raw),
                product_name_norm=_stringify(product_norm),
                product_id=product_id,
                product_category=_stringify(
                    row_payload.get("product_category", {}).get("normalized", "")
                ),
                manager_raw=_stringify(manager_raw),
                manager_norm=_stringify(manager_norm),
                manager_id=manager_id,
            )
            db.add(record)
        else:
            record = FactMarketingSpend(
                project_id=upload.project_id,
                date=row_payload.get("date_parsed"),
                spend_amount=row_payload.get("spend_amount_parsed"),
            )
            db.add(record)
        inserted += 1

    upload.status = UploadStatus.IMPORTED
    db.commit()
    try:
        generate_insights_for_project(db, upload.project_id)
        db.commit()
    except Exception:
        db.rollback()
    return ImportResult(imported=inserted)
