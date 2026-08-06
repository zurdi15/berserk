"""Lógica de entreno a nivel de sesión (no de serie individual, ver
workout_sets.py). Ningún método de este módulo hace commit: el router es el
dueño de la transacción."""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..models import ExerciseMuscleGroup, WorkoutMuscleGroup


def sync_derived_muscle_groups(
    db: Session, workout_id: int, exercise_ids: list[int]
) -> None:
    """Recalcula WorkoutMuscleGroup a partir de los grupos PRIMARIOS de los
    ejercicios que de verdad están en el entreno ahora mismo (item 4, round
    v0.3.0: "grupos musculares derivados de los ejercicios de ese
    entrenamiento" — se deja de preguntar al usuario). Reemplaza cualquier
    tag manual anterior: la tabla pasa a ser "el estado derivado vigente",
    no un registro de elecciones del usuario. Se llama tras cada alta/baja de
    ejercicio (incluida la copia inicial de ejercicios al empezar un entreno
    desde una rutina); registrar una serie de un ejercicio ya presente no
    cambia el conjunto de ejercicios, así que no hace falta llamarla ahí.

    Recibe la lista de exercise_id explícita (no el objeto Workout) para no
    depender de que la colección `workout.exercises` en memoria ya refleje un
    alta/baja recién hecho antes del commit — un flush no garantiza que una
    relación ya cargada se reordene sola.
    """
    group_ids: set[int] = set()
    if exercise_ids:
        rows = db.execute(
            select(ExerciseMuscleGroup.muscle_group_id).where(
                ExerciseMuscleGroup.exercise_id.in_(exercise_ids),
                ExerciseMuscleGroup.is_primary.is_(True),
            )
        ).all()
        group_ids = {row[0] for row in rows}
    db.execute(delete(WorkoutMuscleGroup).where(WorkoutMuscleGroup.workout_id == workout_id))
    db.flush()
    for group_id in group_ids:
        db.add(WorkoutMuscleGroup(workout_id=workout_id, muscle_group_id=group_id))
