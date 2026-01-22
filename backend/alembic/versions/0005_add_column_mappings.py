"""add column mappings table

Revision ID: 0005_add_column_mappings
Revises: 0004_add_uploads
Create Date: 2024-01-02 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "0005_add_column_mappings"
down_revision = "0004_add_uploads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "column_mappings",
        sa.Column("upload_id", sa.Integer(), primary_key=True),
        sa.Column("mapping_json", sa.JSON(), nullable=False),
        sa.Column("normalization_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["upload_id"], ["uploads.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("column_mappings")
