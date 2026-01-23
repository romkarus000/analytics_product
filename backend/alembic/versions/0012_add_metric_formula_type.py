"""add metric formula type

Revision ID: 0012_add_metric_formula_type
Revises: 0011_update_mapping_settings
Create Date: 2025-02-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0012_add_metric_formula_type"
down_revision = "0011_update_mapping_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "metric_definitions",
        sa.Column("formula_type", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("metric_definitions", "formula_type")
