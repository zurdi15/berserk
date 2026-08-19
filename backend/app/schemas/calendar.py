from datetime import date as date_type

from pydantic import BaseModel

# (v0.25.0: los schemas de planificación de sesiones — ScheduleIn/
# SchedulePatchIn/ScheduledOut — MURIERON con la feature entera: zurdi,
# "teniendo las rutinas y planes rotatorios, planificar un entrenamiento ya
# no aporta nada")


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
    workouts: list[WorkoutSummaryOut]
    # solo viajan cuando se ve el PROPIO calendario (nunca en modo atleta, ver
    # calendar.py::month_view) — None + response_model_exclude_unset hace que
    # el campo directamente NO aparezca en el JSON en vez de viajar como
    # "shared": null, para que el frontend distinga "sin overlay" (modo
    # atleta) de "overlay vacío" (sin shares) sin un segundo flag
    shared: list[SharedUserOut] | None = None
