"""add insights

Revision ID: 0009_add_insights
Revises: 0008_add_metric_definitions
Create Date: 2024-01-04 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "0009_add_insights"
down_revision = "0008_add_metric_definitions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "insights",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("metric_key", sa.String(length=64), nullable=False),
        sa.Column("period_from", sa.Date(), nullable=False),
        sa.Column("period_to", sa.Date(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("evidence_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_insights_project_id", "insights", ["project_id"])
    op.create_index("ix_insights_metric_key", "insights", ["metric_key"])
    op.create_index("ix_insights_period_from", "insights", ["period_from"])
    op.create_index("ix_insights_period_to", "insights", ["period_to"])



def downgrade() -> None:
    op.drop_index("ix_insights_period_to", table_name="insights")
    op.drop_index("ix_insights_period_from", table_name="insights")
    op.drop_index("ix_insights_metric_key", table_name="insights")
    op.drop_index("ix_insights_project_id", table_name="insights")
    op.drop_table("insights")
