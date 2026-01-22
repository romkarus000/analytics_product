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
from app.models.project import Project
from app.models.upload import Upload, UploadType
from app.schemas.uploads import ColumnMappingCreate, ColumnMappingPublic, UploadPreview

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
