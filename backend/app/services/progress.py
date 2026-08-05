"""Agregados de progresión. Nada de este módulo hace commit."""

from collections.abc import Iterable
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    ExerciseMuscleGroup,
    Workout,
    WorkoutExercise,
    WorkoutMuscleGroup,
    WorkoutSet,
)
from .workout_sets import estimate_1rm


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


def exercise_series(db: Session, owner_id: int, exercise_id: int) -> list[dict]:
    """Serie temporal del ejercicio: mejor peso, volumen y 1RM estimado por sesión."""
    rows = db.execute(
        select(Workout.id, Workout.date, WorkoutSet.reps, WorkoutSet.weight_kg)
        .join(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .join(WorkoutSet, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        .where(
            Workout.owner_id == owner_id,
            WorkoutExercise.exercise_id == exercise_id,
            WorkoutSet.is_warmup.is_(False),
            WorkoutSet.reps.is_not(None),
            WorkoutSet.weight_kg.is_not(None),
        )
        .order_by(Workout.date, Workout.id)
    ).all()
    by_workout: dict[int, dict] = {}
    for workout_id, workout_date, reps, weight in rows:
        entry = by_workout.setdefault(
            workout_id,
            {"workout_id": workout_id, "date": workout_date, "top_weight": 0.0,
             "volume": 0.0, "est_1rm": 0.0},
        )
        entry["top_weight"] = max(entry["top_weight"], weight)
        entry["volume"] += reps * weight
        entry["est_1rm"] = max(entry["est_1rm"], estimate_1rm(weight, reps))
    return list(by_workout.values())


def _prev_week(week: tuple[int, int]) -> tuple[int, int]:
    """Calcula la semana ISO anterior."""
    year, number = week
    monday = date.fromisocalendar(year, number, 1)
    previous = monday - timedelta(weeks=1)
    iso = previous.isocalendar()
    return (iso[0], iso[1])


def weekly_streak(dates: Iterable[date], today: date) -> int:
    """Semanas ISO consecutivas con entreno. La semana en curso sin entrenar
    aún no rompe la racha: siempre queda tiempo de salvarla."""
    weeks = {(d.isocalendar()[0], d.isocalendar()[1]) for d in dates}
    iso = today.isocalendar()
    current = (iso[0], iso[1])
    if current not in weeks:
        current = _prev_week(current)
    streak = 0
    while current in weeks:
        streak += 1
        current = _prev_week(current)
    return streak


def annual_heatmap(db: Session, owner_id: int, year: int) -> list[tuple[date, int]]:
    """Workouts por día en el año: lista de (fecha, count)."""
    rows = db.execute(
        select(Workout.date, func.count(Workout.id))
        .where(
            Workout.owner_id == owner_id,
            Workout.date >= date(year, 1, 1),
            Workout.date <= date(year, 12, 31),
        )
        .group_by(Workout.date)
        .order_by(Workout.date)
    ).all()
    return [(row[0], row[1]) for row in rows]


def muscle_distribution(db: Session, owner_id: int, start: date, end: date) -> dict[int, int]:
    """Series efectivas por grupo muscular primario en el rango."""
    rows = db.execute(
        select(ExerciseMuscleGroup.muscle_group_id, func.count(WorkoutSet.id))
        .join(
            WorkoutExercise,
            WorkoutExercise.exercise_id == ExerciseMuscleGroup.exercise_id,
        )
        .join(WorkoutSet, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(
            Workout.owner_id == owner_id,
            Workout.date >= start,
            Workout.date <= end,
            ExerciseMuscleGroup.is_primary.is_(True),
            WorkoutSet.is_warmup.is_(False),
        )
        .group_by(ExerciseMuscleGroup.muscle_group_id)
    ).all()
    return {row[0]: row[1] for row in rows}
