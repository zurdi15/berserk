"""Lógica de entreno a nivel de sesión (no de serie individual, ver
workout_sets.py). Ningún método de este módulo hace commit: el router es el
dueño de la transacción."""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..models import ExerciseMuscleGroup, WorkoutExercise, WorkoutMuscleGroup


def primary_muscle_groups_by_workout(db: Session, workout_ids: list[int]) -> dict[int, set[int]]:
    """Grupos musculares PRIMARIOS derivados de los ejercicios de cada
    workout (WorkoutExercise ⋈ ExerciseMuscleGroup WHERE is_primary), SIN
    tags manuales — la mitad "derivada" del cálculo, sin la unión manual.

    Fix M9 (revisión de este lane): antes esta misma query vivía duplicada
    en dos sitios casi idénticos — sync_derived_muscle_groups (de abajo, para
    UN workout) y la mitad derivada de progress.py::workout_muscle_group_ids
    (para VARIOS workouts a la vez, sumándole luego la mitad manual para el
    resumen del calendario). Ahora ambas llaman a esta.
    """
    result: dict[int, set[int]] = {wid: set() for wid in workout_ids}
    if not workout_ids:
        return result
    rows = db.execute(
        select(WorkoutExercise.workout_id, ExerciseMuscleGroup.muscle_group_id)
        .join(
            ExerciseMuscleGroup,
            ExerciseMuscleGroup.exercise_id == WorkoutExercise.exercise_id,
        )
        .where(
            WorkoutExercise.workout_id.in_(workout_ids),
            ExerciseMuscleGroup.is_primary.is_(True),
        )
    ).all()
    for workout_id, group_id in rows:
        result[workout_id].add(group_id)
    return result


def sync_derived_muscle_groups(db: Session, workout_id: int) -> None:
    """Recalcula WorkoutMuscleGroup a partir de los grupos PRIMARIOS de los
    ejercicios que de verdad están en el entreno ahora mismo (item 4, round
    v0.3.0: "grupos musculares derivados de los ejercicios de ese
    entrenamiento" — se deja de preguntar al usuario). Reemplaza cualquier
    tag manual anterior: la tabla pasa a ser "el estado derivado vigente",
    no un registro de elecciones del usuario. Se llama tras cada alta/baja de
    ejercicio (incluida la copia inicial de ejercicios al empezar un entreno
    desde una rutina); registrar una serie de un ejercicio ya presente no
    cambia el conjunto de ejercicios, así que no hace falta llamarla ahí.

    Lee workout_exercises con una consulta fresca (vía
    primary_muscle_groups_by_workout), no de una colección `workout.exercises`
    en memoria potencialmente desactualizada — por eso exige que cualquier
    alta/baja ya esté FLUSHED en `db` antes de llamarla. Los tres call sites
    de routers/workouts.py (start_workout, add_exercise, remove_exercise) ya
    hacen ese flush justo antes.
    """
    group_ids = primary_muscle_groups_by_workout(db, [workout_id])[workout_id]
    db.execute(delete(WorkoutMuscleGroup).where(WorkoutMuscleGroup.workout_id == workout_id))
    db.flush()
    for group_id in group_ids:
        db.add(WorkoutMuscleGroup(workout_id=workout_id, muscle_group_id=group_id))
