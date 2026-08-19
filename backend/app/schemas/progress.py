from datetime import date as date_type

from pydantic import BaseModel


class SeriesPoint(BaseModel):
    workout_id: int
    date: date_type
    top_weight: float
    volume: float
    est_1rm: float
    # v0.20.x (zurdi: "la gráfica solo muestra peso, pero tenemos niveles"):
    # mejor NIVEL de la sesión (series en load_mode 'level'); 0 = sin series
    # de nivel ese día — eje aparte del kg, nunca se mezclan
    top_level: float = 0.0
    # v0.23.0: duración TOTAL efectiva de la sesión (cardio/timed) — el
    # progreso de cardio es por tiempos, no por kg
    duration_seconds: int = 0
    distance_m: float = 0.0


class SeriesOut(BaseModel):
    series: list[SeriesPoint]


class HeatmapDay(BaseModel):
    date: date_type
    count: int


class StreakOut(BaseModel):
    weeks: int


class DistributionItem(BaseModel):
    muscle_group_id: int
    sets: int


class TrainedExercisesOut(BaseModel):
    exercise_ids: list[int]


# item 3 (round v0.3.0): "quiero ver la última serie registrada... en pequeño
# en algún lado" — historial de la última sesión TERMINADA (distinta de la
# actual) donde se hizo este ejercicio, con todas sus series
class ExerciseHistorySetOut(BaseModel):
    reps: int | None
    weight_kg: float | None
    duration_seconds: int | None
    distance_m: float | None
    is_warmup: bool
    # v0.18.0: el modo viaja con la historia — el hint "última vez" pinta
    # cada serie según cómo se registró, y el prefill del cajón hereda el
    # modo de la última serie (el default inteligente que sustituye al
    # ajuste por-ejercicio retirado)
    load_mode: str = "weight"

    model_config = {"from_attributes": True}


# v0.10.0 (zurdi: "en cardio, cuánto se hizo las últimas 4 veces"): una
# entrada por serie de cardio en entrenos TERMINADOS, la más reciente primero
class CardioEntryOut(BaseModel):
    date: date_type
    duration_seconds: int | None
    distance_m: float | None


class ExerciseHistoryOut(BaseModel):
    workout_id: int
    date: date_type
    sets: list[ExerciseHistorySetOut]
    # solo se puebla para ejercicios de cardio (ver routers/progress.py)
    recent_cardio: list[CardioEntryOut] = []


# v0.24.0 (vista detalle por ejercicio): una sesión terminada con sus series
class ExerciseSessionOut(BaseModel):
    workout_id: int
    date: date_type
    sets: list[ExerciseHistorySetOut]


class StatsOut(BaseModel):
    total_workouts: int
    total_gym_seconds: int
    total_cardio_seconds: int
    total_distance_m: float
    total_volume_kg: float
    total_sets: int
    total_reps: int
    prs_count: int
    avg_session_seconds: float
    longest_streak_weeks: int
