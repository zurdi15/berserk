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


class SharedUserOut(BaseModel):
    """Un usuario que me ha concedido acceso (ShareGrant owner->yo) y los días
    del mes con >=1 entreno terminado suyo — ambient awareness en MI PROPIO
    calendario, nunca detalle (eso sigue detrás del modo atleta)."""

    user_id: int
    username: str
    color: str | None
    dates: list[date_type]


class CalendarMonthOut(BaseModel):
    scheduled: list[ScheduledOut]
    workouts: list[WorkoutSummaryOut]
    # solo viajan cuando se ve el PROPIO calendario (nunca en modo atleta, ver
    # calendar.py::month_view) — None + response_model_exclude_unset hace que
    # el campo directamente NO aparezca en el JSON en vez de viajar como
    # "shared": null, para que el frontend distinga "sin overlay" (modo
    # atleta) de "overlay vacío" (sin shares) sin un segundo flag
    shared: list[SharedUserOut] | None = None
