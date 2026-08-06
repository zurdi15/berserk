"""backfill derived muscle groups

Revision ID: 4d8d5ec665aa
Revises: 3ef11d1b0db2

Fix I3 (revisión de este lane): sync_derived_muscle_groups (item 4, ver
services/workouts.py) solo se dispara en start-from-routine/add_exercise/
remove_exercise DE AQUÍ EN ADELANTE. Cualquier workout que ya existiera
antes de esa migración/feature se quedó con WorkoutMuscleGroup vacío o con
tags MANUALES viejas (del editor que este mismo lane retiró) — sin este
backfill, esos entrenos históricos nunca derivarían sus grupos musculares
hasta la próxima alta/baja de ejercicio (que puede no llegar nunca para un
entreno ya cerrado).

Mismos semántica exacta que sync_derived_muscle_groups: por cada workout,
la unión de los grupos PRIMARIOS de sus ejercicios (WorkoutExercise ⋈
ExerciseMuscleGroup WHERE is_primary), reemplazando cualquier fila anterior.
Un solo DELETE + INSERT...SELECT DISTINCT global (no fila a fila) porque
esto puede correr sobre una base con años de historial.

Create Date: 2026-08-06 23:20:07.381776

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4d8d5ec665aa'
down_revision: Union[str, Sequence[str], None] = '3ef11d1b0db2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Backfill: reemplaza TODAS las filas de workout_muscle_groups por el
    derivado real de cada workout a partir de sus ejercicios actuales."""
    op.execute(sa.text("DELETE FROM workout_muscle_groups"))
    op.execute(
        sa.text(
            """
            INSERT INTO workout_muscle_groups (workout_id, muscle_group_id)
            SELECT DISTINCT we.workout_id, emg.muscle_group_id
            FROM workout_exercises we
            JOIN exercise_muscle_groups emg
              ON emg.exercise_id = we.exercise_id
             AND emg.is_primary = 1
            """
        )
    )


def downgrade() -> None:
    """No reversible de forma significativa: es un backfill de datos
    derivados, no un cambio de esquema — no hay "tags manuales originales"
    que recuperar (esa función ya no existe en el frontend, ver item 4).
    Dejar las filas derivadas tal cual en un downgrade es más seguro que
    borrarlas a ciegas."""
    pass
