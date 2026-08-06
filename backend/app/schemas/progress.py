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
