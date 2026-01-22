"""add metric definitions

Revision ID: 0008_add_metric_definitions
Revises: 0007_add_dimensions
Create Date: 2024-01-03 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "0008_add_metric_definitions"
down_revision = "0007_add_dimensions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "metric_definitions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("metric_key", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_table", sa.String(length=128), nullable=True),
        sa.Column("aggregation", sa.String(length=64), nullable=True),
        sa.Column("filters_json", sa.Text(), nullable=True),
        sa.Column("dims_allowed_json", sa.Text(), nullable=True),
        sa.Column("requirements_json", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("metric_key", name="uq_metric_definitions_key"),
    )
    op.create_index(
        "ix_metric_definitions_metric_key", "metric_definitions", ["metric_key"]
    )


def downgrade() -> None:
    op.drop_index("ix_metric_definitions_metric_key", table_name="metric_definitions")
    op.drop_table("metric_definitions")
