"""Agregados de progresión. Nada de este módulo hace commit."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    ExerciseMuscleGroup,
    WorkoutExercise,
    WorkoutMuscleGroup,
)


def workout_muscle_group_ids(db: Session, workout_ids: list[int]) -> dict[int, set[int]]:
    """Grupos por workout: primarios de los ejercicios registrados ∪ tags manuales."""
    result: dict[int, set[int]] = {wid: set() for wid in workout_ids}
    if not workout_ids:
        return result
    derived = db.execute(
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
    for workout_id, group_id in derived:
        result[workout_id].add(group_id)
    manual = db.execute(
        select(WorkoutMuscleGroup.workout_id, WorkoutMuscleGroup.muscle_group_id).where(
            WorkoutMuscleGroup.workout_id.in_(workout_ids)
        )
    ).all()
    for workout_id, group_id in manual:
        result[workout_id].add(group_id)
    return result
