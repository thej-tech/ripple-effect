"""Persist generated commentary separately from immutable run inputs."""

import sqlalchemy as sa
from alembic import op

revision = "f64d81a2c039"
down_revision = "e52c93d6b018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analysis_explanations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("input_hash", sa.String(128), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name="fk_analysis_explanations_organization",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "run_id", "entity_id"],
            ["impact_results.organization_id", "impact_results.run_id", "impact_results.entity_id"],
            name="fk_analysis_explanations_result_tenant",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_analysis_explanations_creator",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_analysis_explanations_result_created",
        "analysis_explanations",
        ["organization_id", "run_id", "entity_id", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_analysis_explanations_result_created", table_name="analysis_explanations")
    op.drop_table("analysis_explanations")
