"""Lógica pura de series: validación por tipo de medición y detección de PRs.

Ningún método de este módulo hace commit: el router es el dueño de la
transacción y confirma una sola vez por request.
"""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Exercise, PersonalRecord, WorkoutExercise, WorkoutSet, utcnow

SET_VALUE_FIELDS = ("reps", "weight_kg", "duration_seconds", "distance_m")

_REQUIRED = {
    "strength": ("reps", "weight_kg"),
    "bodyweight": ("reps",),
    "timed": ("duration_seconds",),
    "cardio": ("duration_seconds",),
}
_ALLOWED = {
    "strength": {"reps", "weight_kg"},
    "bodyweight": {"reps", "weight_kg"},
    "timed": {"duration_seconds"},
    "cardio": {"duration_seconds", "distance_m"},
}


def validate_set_fields(measurement: str, data: dict) -> None:
    present = {f for f in SET_VALUE_FIELDS if data.get(f) is not None}
    if not set(_REQUIRED[measurement]) <= present:
        raise ValueError("invalid_set_fields")
    if present - _ALLOWED[measurement]:
        raise ValueError("invalid_set_fields")


def estimate_1rm(weight_kg: float, reps: int) -> float:
    """Fórmula de Epley; con 1 repetición el 1RM es el propio peso levantado."""
    if reps == 1:
        return round(weight_kg, 2)
    return round(weight_kg * (1 + reps / 30), 2)


def effective_set_filters() -> tuple:
    """Condiciones de un set "efectivo" de fuerza: sin calentamientos, con
    reps y peso registrados. Único sitio que define el criterio — lo comparten
    session_volume (por sesión) y las stats agregadas de progress.py (por
    usuario, item de round 8) para no repetir la misma tripleta de where()."""
    return (
        WorkoutSet.is_warmup.is_(False),
        WorkoutSet.reps.is_not(None),
        WorkoutSet.weight_kg.is_not(None),
    )


def session_volume(db: Session, workout_id: int, exercise_id: int) -> float:
    """Volumen efectivo (reps×kg, sin calentamientos) del ejercicio en la sesión."""
    value = db.scalar(
        select(func.coalesce(func.sum(WorkoutSet.reps * WorkoutSet.weight_kg), 0.0))
        .join(WorkoutExercise, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        .where(
            WorkoutExercise.workout_id == workout_id,
            WorkoutExercise.exercise_id == exercise_id,
            *effective_set_filters(),
        )
    )
    return float(value)


def detect_prs(
    db: Session,
    owner_id: int,
    exercise: Exercise,
    wset: WorkoutSet,
    volume: float,
    achieved_at: datetime | None = None,
) -> list[PersonalRecord]:
    """Records nuevos que provoca esta serie (se devuelven para celebrarlos en el acto).

    `achieved_at` es opcional para no tocar los call sites de los routers (siempre
    "ahora"); el dev seed sí lo pasa explícito para backdatar los PR con el resto
    del historial en vez de amontonarlos todos en el instante de ejecución del seed.
    """
    if exercise.measurement not in ("strength", "bodyweight"):
        return []
    if wset.is_warmup or not wset.reps or not wset.weight_kg:
        return []
    candidates = {
        "max_weight": float(wset.weight_kg),
        "est_1rm": estimate_1rm(wset.weight_kg, wset.reps),
        "max_volume": volume,
    }
    new_records: list[PersonalRecord] = []
    for kind, value in candidates.items():
        best = db.scalar(
            select(func.max(PersonalRecord.value)).where(
                PersonalRecord.owner_id == owner_id,
                PersonalRecord.exercise_id == exercise.id,
                PersonalRecord.kind == kind,
            )
        )
        if best is None or value > best:
            record = PersonalRecord(
                owner_id=owner_id,
                exercise_id=exercise.id,
                kind=kind,
                value=value,
                set_id=wset.id,
                achieved_at=achieved_at or utcnow(),
            )
            db.add(record)
            new_records.append(record)
    db.flush()
    return new_records
