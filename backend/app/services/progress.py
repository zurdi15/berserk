"""Agregados de progresión. Nada de este módulo hace commit."""

from collections.abc import Iterable
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    Exercise,
    ExerciseMuscleGroup,
    PersonalRecord,
    Workout,
    WorkoutExercise,
    WorkoutMuscleGroup,
    WorkoutSet,
)
from .workout_sets import effective_set_filters, estimate_1rm


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


def longest_streak_weeks(dates: Iterable[date]) -> int:
    """Racha más larga de semanas ISO consecutivas en TODO el histórico (item
    de round 8: "stats de por vida"), a diferencia de weekly_streak que solo
    mira la racha actual/vigente. Mismo criterio de semana ISO: se ordenan los
    lunes de cada semana entrenada y se busca la tirada más larga de saltos de
    7 días exactos — los lunes ISO siempre distan 7 días entre semanas
    consecutivas, incluso al cruzar de año, así que basta comparar fechas."""
    weeks = {(d.isocalendar()[0], d.isocalendar()[1]) for d in dates}
    if not weeks:
        return 0
    mondays = sorted(date.fromisocalendar(year, number, 1) for year, number in weeks)
    best = current = 1
    for prev, curr in zip(mondays, mondays[1:]):
        if curr - prev == timedelta(weeks=1):
            current += 1
            best = max(best, current)
        else:
            current = 1
    return best


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


def trained_exercise_ids(db: Session, owner_id: int) -> set[int]:
    """Ids de ejercicios con al menos una serie registrada (item 5): base para
    el punto aurora de "con datos" en el selector de Progresión."""
    rows = db.execute(
        select(WorkoutExercise.exercise_id.distinct())
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .join(WorkoutSet, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        .where(Workout.owner_id == owner_id)
    ).all()
    return {row[0] for row in rows}


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


def lifetime_stats(db: Session, owner_id: int) -> dict:
    """Totales de por vida para la pestaña Estadísticas de Progresión (round 8,
    "stats que mole"): entrenos, tiempo, cardio, volumen, series/reps, PRs y
    la racha histórica más larga. Todo cero-safe para un usuario sin datos."""
    finished = db.execute(
        select(Workout.started_at, Workout.ended_at).where(
            Workout.owner_id == owner_id, Workout.ended_at.is_not(None)
        )
    ).all()
    total_workouts = len(finished)
    # started_at siempre se rellena al crear el entreno (ver routers/workouts.py
    # start_workout), pero el modelo lo permite NULL: se filtra defensivo en
    # vez de asumirlo y reventar con un TypeError al restar None
    total_gym_seconds = sum(
        int((ended - started).total_seconds())
        for started, ended in finished
        if started is not None
    )

    # series/reps "efectivos" (sin calentamiento) de TODA la historia, no solo
    # de fuerza: cuenta también las series de cardio/timed, igual que el
    # "effectiveSets" de WeekSummaryCard en el frontend
    sets_row = db.execute(
        select(func.count(WorkoutSet.id), func.coalesce(func.sum(WorkoutSet.reps), 0))
        .join(WorkoutExercise, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(Workout.owner_id == owner_id, WorkoutSet.is_warmup.is_(False))
    ).one()
    total_sets, total_reps = int(sets_row[0]), int(sets_row[1])

    cardio_row = db.execute(
        select(
            func.coalesce(func.sum(WorkoutSet.duration_seconds), 0),
            func.coalesce(func.sum(WorkoutSet.distance_m), 0.0),
        )
        .join(WorkoutExercise, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        .join(Exercise, Exercise.id == WorkoutExercise.exercise_id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(Workout.owner_id == owner_id, Exercise.measurement == "cardio")
    ).one()
    total_cardio_seconds, total_distance_m = int(cardio_row[0]), float(cardio_row[1])

    # mismo criterio de "volumen efectivo" que session_volume (item 5 de este
    # módulo): se reutiliza effective_set_filters en vez de repetir la tripleta
    total_volume_kg = db.scalar(
        select(func.coalesce(func.sum(WorkoutSet.reps * WorkoutSet.weight_kg), 0.0))
        .join(WorkoutExercise, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(Workout.owner_id == owner_id, *effective_set_filters())
    )

    prs_count = db.scalar(
        select(func.count(PersonalRecord.id)).where(PersonalRecord.owner_id == owner_id)
    )

    dates = db.scalars(select(Workout.date).where(Workout.owner_id == owner_id)).all()

    return {
        "total_workouts": total_workouts,
        "total_gym_seconds": total_gym_seconds,
        "total_cardio_seconds": total_cardio_seconds,
        "total_distance_m": total_distance_m,
        "total_volume_kg": float(total_volume_kg),
        "total_sets": total_sets,
        "total_reps": total_reps,
        "prs_count": int(prs_count),
        "avg_session_seconds": (total_gym_seconds / total_workouts) if total_workouts else 0.0,
        "longest_streak_weeks": longest_streak_weeks(dates),
    }
