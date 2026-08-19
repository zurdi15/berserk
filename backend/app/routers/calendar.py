from calendar import monthrange
from datetime import date as date_type

from fastapi import APIRouter, Depends, Path
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import Workout
from ..permissions import TargetUser
from ..schemas.calendar import CalendarMonthOut, WorkoutSummaryOut
from ..services.calendar import shared_calendar_users
from ..services.progress import workout_muscle_group_ids

# v0.25.0: la PLANIFICACIÓN de sesiones murió entera (zurdi: "teniendo las
# rutinas y planes rotatorios ya no aporta nada") — el calendario queda como
# vista de lo ENTRENADO: entrenos del mes + overlay de compartidos.
router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/{year}/{month}", response_model=CalendarMonthOut, response_model_exclude_unset=True)
def month_view(
    target: TargetUser,
    user: CurrentUser,
    year: int = Path(ge=2000, le=2100),
    month: int = Path(ge=1, le=12),
    db: Session = Depends(get_db),
):
    first = date_type(year, month, 1)
    last = date_type(year, month, monthrange(year, month)[1])
    workouts = db.scalars(
        select(Workout)
        .where(Workout.owner_id == target.id, Workout.date >= first, Workout.date <= last)
        .order_by(Workout.date)
    ).all()
    groups = workout_muscle_group_ids(db, [w.id for w in workouts])
    payload = {
        "workouts": [
            WorkoutSummaryOut(
                id=w.id,
                date=w.date,
                feeling=w.feeling,
                muscle_group_ids=sorted(groups[w.id]),
            )
            for w in workouts
        ],
    }
    # SHARED-DOTS OVERLAY: solo en MI PROPIO calendario, nunca en modo atleta
    # (target != user) — ahí ya se está "en la vista de otro", el overlay de
    # ambient awareness no aplica (ver schemas/calendar.py::CalendarMonthOut)
    if target.id == user.id:
        payload["shared"] = shared_calendar_users(db, user.id, first, last)
    return payload
