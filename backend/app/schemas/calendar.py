from datetime import date as date_type
from datetime import time as time_type
from typing import Literal

from pydantic import BaseModel, Field


class ScheduleIn(BaseModel):
    date: date_type
    time: time_type | None = None
    routine_id: int | None = None
    note: str | None = Field(None, max_length=300)


class SchedulePatchIn(BaseModel):
    date: date_type | None = None
    time: time_type | None = None
    routine_id: int | None = None
    note: str | None = Field(None, max_length=300)
    status: Literal["planned", "skipped"] | None = None


class ScheduledOut(BaseModel):
    id: int
    date: date_type
    time: time_type | None
    routine_id: int | None
    status: str
    workout_id: int | None
    note: str | None

    model_config = {"from_attributes": True}


class WorkoutSummaryOut(BaseModel):
    id: int
    date: date_type
    feeling: int | None
    muscle_group_ids: list[int]


class CalendarMonthOut(BaseModel):
    scheduled: list[ScheduledOut]
    workouts: list[WorkoutSummaryOut]
