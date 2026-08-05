from datetime import date as date_type
from datetime import datetime

from pydantic import BaseModel, Field


class WorkoutStartIn(BaseModel):
    date: date_type | None = None
    routine_id: int | None = None
    scheduled_session_id: int | None = None
    started_at: datetime | None = None


class WorkoutPatchIn(BaseModel):
    date: date_type | None = None
    note: str | None = Field(None, max_length=500)
    feeling: int | None = Field(None, ge=1, le=5)


class SetOut(BaseModel):
    id: int
    set_number: int
    reps: int | None
    weight_kg: float | None
    duration_seconds: int | None
    distance_m: float | None
    is_warmup: bool
    rpe: int | None
    completed_at: datetime

    model_config = {"from_attributes": True}


class WorkoutExerciseOut(BaseModel):
    id: int
    exercise_id: int
    position: int
    note: str | None
    sets: list[SetOut]

    model_config = {"from_attributes": True}


class WorkoutOut(BaseModel):
    id: int
    date: date_type
    started_at: datetime | None
    ended_at: datetime | None
    routine_id: int | None
    note: str | None
    feeling: int | None
    exercises: list[WorkoutExerciseOut]
    muscle_tag_ids: list[int] = []


class PersonalRecordOut(BaseModel):
    id: int
    exercise_id: int
    kind: str
    value: float
    achieved_at: datetime

    model_config = {"from_attributes": True}
