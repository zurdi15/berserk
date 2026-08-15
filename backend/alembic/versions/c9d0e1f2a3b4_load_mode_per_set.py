"""load_mode por SERIE (y en los PRs), fuera del ejercicio

v0.18.0 (zurdi: "no quiero editar el ejercicio para ponerlo en kg o nivel —
eso se decide cuando VAS A HACER el ejercicio: un día la polea libre es la
de kg y otro la de niveles"): el modo deja de ser una propiedad del
ejercicio y pasa a la serie. Los PRs también lo llevan: un récord de nivel
solo compite contra récords de nivel, y sin el modo en la fila el frontend
no sabría pintarlo plano.

Backfill: las series y PRs históricos de ejercicios que estaban en modo
'level' (v0.17.0-0.17.2) se marcan como nivel antes de tirar la columna del
ejercicio — nada cambia de significado, solo de sitio.

Revision ID: c9d0e1f2a3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-08-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "workout_sets",
        sa.Column("load_mode", sa.String(length=10), nullable=False, server_default="weight"),
    )
    op.add_column(
        "personal_records",
        sa.Column("load_mode", sa.String(length=10), nullable=False, server_default="weight"),
    )
    # backfill desde el modo por-ejercicio de la v0.17.x
    op.execute(
        """
        UPDATE workout_sets SET load_mode = 'level'
        WHERE workout_exercise_id IN (
            SELECT we.id FROM workout_exercises we
            JOIN exercises e ON e.id = we.exercise_id
            WHERE e.load_mode = 'level'
        )
        """
    )
    op.execute(
        """
        UPDATE personal_records SET load_mode = 'level'
        WHERE exercise_id IN (SELECT id FROM exercises WHERE load_mode = 'level')
        """
    )
    op.drop_column("exercises", "load_mode")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "exercises",
        sa.Column("load_mode", sa.String(length=10), nullable=False, server_default="weight"),
    )
    op.drop_column("personal_records", "load_mode")
    op.drop_column("workout_sets", "load_mode")
