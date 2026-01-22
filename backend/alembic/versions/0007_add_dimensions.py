"""add dimension tables

Revision ID: 0007_add_dimensions
Revises: 0006_add_fact_tables
Create Date: 2024-01-03 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "0007_add_dimensions"
down_revision = "0006_add_fact_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dim_products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("canonical_name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=False),
        sa.Column("product_type", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "project_id", "canonical_name", name="uq_dim_products_name"
        ),
    )
    op.create_index("ix_dim_products_project_id", "dim_products", ["project_id"])

    op.create_table(
        "dim_product_aliases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("alias", sa.String(length=255), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["product_id"], ["dim_products.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "project_id", "alias", name="uq_dim_product_aliases_alias"
        ),
    )
    op.create_index(
        "ix_dim_product_aliases_project_id",
        "dim_product_aliases",
        ["project_id"],
    )

    op.create_table(
        "dim_managers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("canonical_name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "project_id", "canonical_name", name="uq_dim_managers_name"
        ),
    )
    op.create_index("ix_dim_managers_project_id", "dim_managers", ["project_id"])

    op.create_table(
        "dim_manager_aliases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("alias", sa.String(length=255), nullable=False),
        sa.Column("manager_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["manager_id"], ["dim_managers.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "project_id", "alias", name="uq_dim_manager_aliases_alias"
        ),
    )
    op.create_index(
        "ix_dim_manager_aliases_project_id",
        "dim_manager_aliases",
        ["project_id"],
    )

    op.add_column(
        "fact_transactions", sa.Column("product_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_fact_transactions_product_id",
        "fact_transactions",
        "dim_products",
        ["product_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "fact_transactions", sa.Column("manager_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_fact_transactions_manager_id",
        "fact_transactions",
        "dim_managers",
        ["manager_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_fact_transactions_manager_id",
        "fact_transactions",
        type_="foreignkey",
    )
    op.drop_column("fact_transactions", "manager_id")
    op.drop_constraint(
        "fk_fact_transactions_product_id",
        "fact_transactions",
        type_="foreignkey",
    )
    op.drop_column("fact_transactions", "product_id")

    op.drop_index("ix_dim_manager_aliases_project_id", table_name="dim_manager_aliases")
    op.drop_table("dim_manager_aliases")
    op.drop_index("ix_dim_managers_project_id", table_name="dim_managers")
    op.drop_table("dim_managers")
    op.drop_index("ix_dim_product_aliases_project_id", table_name="dim_product_aliases")
    op.drop_table("dim_product_aliases")
    op.drop_index("ix_dim_products_project_id", table_name="dim_products")
    op.drop_table("dim_products")
