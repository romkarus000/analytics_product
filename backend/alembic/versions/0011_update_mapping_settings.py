"""update mapping settings and transactions

Revision ID: 0011_update_mapping_settings
Revises: 0010_add_alerting
Create Date: 2025-02-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_update_mapping_settings"
down_revision = "0010_add_alerting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_settings",
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("group_labels_json", sa.JSON(), nullable=False),
        sa.Column("dedup_policy", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "upload_quarantine_rows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "upload_id",
            sa.Integer(),
            sa.ForeignKey("uploads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("issues_json", sa.JSON(), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_upload_quarantine_rows_upload_id",
        "upload_quarantine_rows",
        ["upload_id"],
    )

    op.add_column(
        "fact_transactions",
        sa.Column("transaction_id", sa.String(length=128), nullable=True),
    )
    op.alter_column(
        "fact_transactions",
        "order_id",
        existing_type=sa.String(length=128),
        nullable=True,
    )
    op.alter_column(
        "fact_transactions",
        "client_id",
        existing_type=sa.String(length=128),
        nullable=True,
    )
    op.alter_column(
        "fact_transactions",
        "product_name_raw",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    op.alter_column(
        "fact_transactions",
        "product_name_norm",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    op.alter_column(
        "fact_transactions",
        "product_category",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    op.alter_column(
        "fact_transactions",
        "manager_raw",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    op.alter_column(
        "fact_transactions",
        "manager_norm",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    op.add_column(
        "fact_transactions",
        sa.Column("group_1", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "fact_transactions",
        sa.Column("group_2", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "fact_transactions",
        sa.Column("group_3", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "fact_transactions",
        sa.Column("group_4", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "fact_transactions",
        sa.Column("group_5", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "fact_transactions",
        sa.Column("fee_1", sa.Float(), nullable=True),
    )
    op.add_column(
        "fact_transactions",
        sa.Column("fee_2", sa.Float(), nullable=True),
    )
    op.add_column(
        "fact_transactions",
        sa.Column("fee_3", sa.Float(), nullable=True),
    )
    op.add_column(
        "fact_transactions",
        sa.Column("fee_total", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("fact_transactions", "fee_total")
    op.drop_column("fact_transactions", "fee_3")
    op.drop_column("fact_transactions", "fee_2")
    op.drop_column("fact_transactions", "fee_1")
    op.drop_column("fact_transactions", "group_5")
    op.drop_column("fact_transactions", "group_4")
    op.drop_column("fact_transactions", "group_3")
    op.drop_column("fact_transactions", "group_2")
    op.drop_column("fact_transactions", "group_1")
    op.alter_column(
        "fact_transactions",
        "manager_norm",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.alter_column(
        "fact_transactions",
        "manager_raw",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.alter_column(
        "fact_transactions",
        "product_category",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.alter_column(
        "fact_transactions",
        "product_name_norm",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.alter_column(
        "fact_transactions",
        "product_name_raw",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.alter_column(
        "fact_transactions",
        "client_id",
        existing_type=sa.String(length=128),
        nullable=False,
    )
    op.alter_column(
        "fact_transactions",
        "order_id",
        existing_type=sa.String(length=128),
        nullable=False,
    )
    op.drop_column("fact_transactions", "transaction_id")

    op.drop_index(
        "ix_upload_quarantine_rows_upload_id",
        table_name="upload_quarantine_rows",
    )
    op.drop_table("upload_quarantine_rows")
    op.drop_table("project_settings")
