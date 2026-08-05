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
