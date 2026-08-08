from datetime import date

from pydantic import BaseModel


class FeedUser(BaseModel):
    id: int
    username: str
    color: str | None


class FeedEvent(BaseModel):
    user: FeedUser
    workout_id: int
    date: date
    duration_seconds: int
    # nombres del grupo primario de cada ejercicio del entreno, en ambos
    # idiomas — el cliente elige por locale ("freyja entrenó pierna")
    muscle_groups_es: list[str]
    muscle_groups_en: list[str]
    pr_count: int
    volume_kg: float


class FeedComparisonRow(BaseModel):
    user: FeedUser
    is_me: bool
    streak_weeks: int
    week_workouts: int
    week_volume_kg: float


class FeedOut(BaseModel):
    events: list[FeedEvent]
    comparison: list[FeedComparisonRow]
