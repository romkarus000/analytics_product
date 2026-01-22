"""add alerting tables

Revision ID: 0010_add_alerting
Revises: 0009_add_insights
Create Date: 2024-01-04 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "0010_add_alerting"
down_revision = "0009_add_insights"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telegram_bindings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("chat_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("project_id", name="uq_telegram_binding_project"),
    )
    op.create_index("ix_telegram_bindings_project_id", "telegram_bindings", ["project_id"])

    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("metric_key", sa.String(length=128), nullable=False),
        sa.Column("rule_type", sa.String(length=32), nullable=False),
        sa.Column("params_json", sa.Text(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_alert_rules_project_id", "alert_rules", ["project_id"])
    op.create_index("ix_alert_rules_metric_key", "alert_rules", ["metric_key"])

    op.create_table(
        "alert_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("fired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["rule_id"], ["alert_rules.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_alert_events_rule_id", "alert_events", ["rule_id"])
    op.create_index("ix_alert_events_fired_at", "alert_events", ["fired_at"])


def downgrade() -> None:
    op.drop_index("ix_alert_events_fired_at", table_name="alert_events")
    op.drop_index("ix_alert_events_rule_id", table_name="alert_events")
    op.drop_table("alert_events")

    op.drop_index("ix_alert_rules_metric_key", table_name="alert_rules")
    op.drop_index("ix_alert_rules_project_id", table_name="alert_rules")
    op.drop_table("alert_rules")

    op.drop_index("ix_telegram_bindings_project_id", table_name="telegram_bindings")
    op.drop_table("telegram_bindings")
