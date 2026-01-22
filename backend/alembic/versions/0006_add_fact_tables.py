"""add fact tables

Revision ID: 0006_add_fact_tables
Revises: 0005_add_column_mappings
Create Date: 2024-01-02 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "0006_add_fact_tables"
down_revision = "0005_add_column_mappings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fact_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.String(length=128), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("operation_type", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("client_id", sa.String(length=128), nullable=False),
        sa.Column("product_name_raw", sa.String(length=255), nullable=False),
        sa.Column("product_name_norm", sa.String(length=255), nullable=False),
        sa.Column("product_category", sa.String(length=255), nullable=False),
        sa.Column("product_type", sa.String(length=255), nullable=True),
        sa.Column("manager_raw", sa.String(length=255), nullable=False),
        sa.Column("manager_norm", sa.String(length=255), nullable=False),
        sa.Column("payment_method", sa.String(length=255), nullable=True),
        sa.Column("commission", sa.Float(), nullable=True),
        sa.Column("utm_source", sa.String(length=255), nullable=True),
        sa.Column("utm_medium", sa.String(length=255), nullable=True),
        sa.Column("utm_campaign", sa.String(length=255), nullable=True),
        sa.Column("utm_term", sa.String(length=255), nullable=True),
        sa.Column("utm_content", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_fact_transactions_project_id", "fact_transactions", ["project_id"]
    )

    op.create_table(
        "fact_marketing_spend",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("spend_amount", sa.Float(), nullable=False),
        sa.Column("channel_raw", sa.String(length=255), nullable=True),
        sa.Column("channel_norm", sa.String(length=255), nullable=True),
        sa.Column("utm_source", sa.String(length=255), nullable=True),
        sa.Column("utm_medium", sa.String(length=255), nullable=True),
        sa.Column("utm_campaign", sa.String(length=255), nullable=True),
        sa.Column("utm_term", sa.String(length=255), nullable=True),
        sa.Column("utm_content", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_fact_marketing_spend_project_id", "fact_marketing_spend", ["project_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_fact_marketing_spend_project_id", table_name="fact_marketing_spend")
    op.drop_table("fact_marketing_spend")
    op.drop_index("ix_fact_transactions_project_id", table_name="fact_transactions")
    op.drop_table("fact_transactions")
