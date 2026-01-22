"""add uploads table

Revision ID: 0004_add_uploads
Revises: 0003_add_projects
Create Date: 2024-01-02 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "0004_add_uploads"
down_revision = "0003_add_projects"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "uploads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column(
            "type",
            sa.Enum("transactions", "marketing_spend", name="upload_type"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("uploaded", "validated", "imported", "failed", name="upload_status"),
            nullable=False,
        ),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_uploads_id", "uploads", ["id"], unique=False)
    op.create_index("ix_uploads_project_id", "uploads", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_uploads_project_id", table_name="uploads")
    op.drop_index("ix_uploads_id", table_name="uploads")
    op.drop_table("uploads")
    op.execute("DROP TYPE IF EXISTS upload_status")
    op.execute("DROP TYPE IF EXISTS upload_type")
