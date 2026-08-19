"""v0.25.0 — adiós a la planificación de sesiones (zurdi: "teniendo las
rutinas y planes rotatorios ya no aporta nada"): la tabla scheduled_sessions
se elimina entera con la feature.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-08-19
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("scheduled_sessions")


def downgrade() -> None:
    # misma forma que tenía en models.py antes de morir — los DATOS no
    # vuelven, solo el esquema
    op.create_table(
        "scheduled_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "owner_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("date", sa.Date(), nullable=False, index=True),
        sa.Column("time", sa.Time(), nullable=True),
        sa.Column(
            "routine_id", sa.Integer(), sa.ForeignKey("routines.id", ondelete="SET NULL")
        ),
        sa.Column("status", sa.String(length=8), nullable=False, server_default="planned"),
        sa.Column(
            "workout_id", sa.Integer(), sa.ForeignKey("workouts.id", ondelete="SET NULL")
        ),
        sa.Column("note", sa.String(length=300)),
    )
