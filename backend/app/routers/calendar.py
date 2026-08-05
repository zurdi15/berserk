from calendar import monthrange
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import Routine, ScheduledSession, Workout
from ..permissions import TargetUser
from ..schemas.calendar import (
    CalendarMonthOut,
    ScheduledOut,
    ScheduleIn,
    SchedulePatchIn,
    WorkoutSummaryOut,
)
from ..services.progress import workout_muscle_group_ids

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _check_routine(db: Session, user_id: int, routine_id: int | None) -> None:
    if routine_id is None:
        return
    routine = db.get(Routine, routine_id)
    if routine is None or routine.owner_id != user_id:
        raise HTTPException(status_code=422, detail="routine_invalid")


@router.post("", response_model=ScheduledOut, status_code=201)
def schedule(payload: ScheduleIn, user: CurrentUser, db: Session = Depends(get_db)):
    _check_routine(db, user.id, payload.routine_id)
    session = ScheduledSession(owner_id=user.id, **payload.model_dump())
    db.add(session)
    db.commit()
    return session


@router.get("/{year}/{month}", response_model=CalendarMonthOut)
def month_view(
    target: TargetUser,
    year: int = Path(ge=2000, le=2100),
    month: int = Path(ge=1, le=12),
    db: Session = Depends(get_db),
):
    first = date_type(year, month, 1)
    last = date_type(year, month, monthrange(year, month)[1])
    scheduled = db.scalars(
        select(ScheduledSession)
        .where(
            ScheduledSession.owner_id == target.id,
            ScheduledSession.date >= first,
            ScheduledSession.date <= last,
        )
        .order_by(ScheduledSession.date, ScheduledSession.time)
    ).all()
    workouts = db.scalars(
        select(Workout)
        .where(Workout.owner_id == target.id, Workout.date >= first, Workout.date <= last)
        .order_by(Workout.date)
    ).all()
    groups = workout_muscle_group_ids(db, [w.id for w in workouts])
    return CalendarMonthOut(
        scheduled=scheduled,
        workouts=[
            WorkoutSummaryOut(
                id=w.id,
                date=w.date,
                feeling=w.feeling,
                muscle_group_ids=sorted(groups[w.id]),
            )
            for w in workouts
        ],
    )


@router.patch("/{session_id}", response_model=ScheduledOut)
def update_schedule(
    session_id: int, payload: SchedulePatchIn, user: CurrentUser, db: Session = Depends(get_db)
):
    session = db.get(ScheduledSession, session_id)
    if session is None or session.owner_id != user.id:
        raise HTTPException(status_code=404, detail="not_found")
    data = payload.model_dump(exclude_unset=True)
    # date y status no son anulables: un null explícito no debe machacarlos
    for field in ("date", "status"):
        if field in data and data[field] is None:
            del data[field]
    if data.get("routine_id") is not None:
        _check_routine(db, user.id, data["routine_id"])
    was_done = session.status == "done"
    for field, value in data.items():
        setattr(session, field, value)
    # al salir de done el enlace al workout deja de ser cierto
    if was_done and session.status != "done":
        session.workout_id = None
    db.commit()
    return session


@router.delete("/{session_id}", status_code=204)
def delete_schedule(session_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    session = db.get(ScheduledSession, session_id)
    if session is None or session.owner_id != user.id:
        raise HTTPException(status_code=404, detail="not_found")
    db.delete(session)
    db.commit()
