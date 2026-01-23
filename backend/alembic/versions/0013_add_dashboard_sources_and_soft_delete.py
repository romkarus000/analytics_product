"""add dashboard sources and soft delete for uploads

Revision ID: 0013_add_dashboard_sources_and_soft_delete
Revises: 0012_add_metric_formula_type
Create Date: 2025-09-27 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0013_add_dashboard_sources_and_soft_delete"
down_revision = "0012_add_metric_formula_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "uploads",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    upload_type_enum = postgresql.ENUM(
        "transactions",
        "marketing_spend",
        name="upload_type",
        create_type=False,
    )
    op.create_table(
        "project_dashboard_sources",
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("data_type", upload_type_enum, nullable=False),
        sa.Column("upload_id", sa.Integer(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["upload_id"], ["uploads.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("project_id", "data_type"),
    )


def downgrade() -> None:
    op.drop_table("project_dashboard_sources")
    op.drop_column("uploads", "is_deleted")
