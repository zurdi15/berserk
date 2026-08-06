from datetime import date as date_type

from pydantic import BaseModel


class SeriesPoint(BaseModel):
    workout_id: int
    date: date_type
    top_weight: float
    volume: float
    est_1rm: float


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

    model_config = {"from_attributes": True}


class ExerciseHistoryOut(BaseModel):
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
