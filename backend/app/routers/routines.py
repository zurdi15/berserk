from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import Routine, RoutineExercise
from ..schemas.routines import RoutineExerciseIn, RoutineIn, RoutineOut, RoutinePatchIn
from .exercises import get_visible_exercise

router = APIRouter(prefix="/routines", tags=["routines"])


def _own_routine(db: Session, user_id: int, routine_id: int) -> Routine:
    routine = db.get(Routine, routine_id)
    if routine is None or routine.owner_id != user_id:
        raise HTTPException(status_code=404, detail="not_found")
    return routine


@router.get("", response_model=list[RoutineOut])
def list_routines(user: CurrentUser, db: Session = Depends(get_db)):
    return db.scalars(
        select(Routine).where(Routine.owner_id == user.id).order_by(Routine.name)
    ).all()


@router.post("", response_model=RoutineOut, status_code=201)
def create_routine(payload: RoutineIn, user: CurrentUser, db: Session = Depends(get_db)):
    routine = Routine(owner_id=user.id, **payload.model_dump())
    db.add(routine)
    db.commit()
    return routine


@router.get("/{routine_id}", response_model=RoutineOut)
def get_routine(routine_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    return _own_routine(db, user.id, routine_id)


@router.patch("/{routine_id}", response_model=RoutineOut)
def update_routine(
    routine_id: int, payload: RoutinePatchIn, user: CurrentUser, db: Session = Depends(get_db)
):
    routine = _own_routine(db, user.id, routine_id)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(routine, field, value)
    db.commit()
    return routine


@router.delete("/{routine_id}", status_code=204)
def delete_routine(routine_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    routine = _own_routine(db, user.id, routine_id)
    db.delete(routine)
    db.commit()


@router.put("/{routine_id}/exercises", response_model=RoutineOut)
def replace_exercises(
    routine_id: int,
    payload: list[RoutineExerciseIn],
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    routine = _own_routine(db, user.id, routine_id)
    for item in payload:
        if get_visible_exercise(db, user.id, item.exercise_id) is None:
            raise HTTPException(status_code=422, detail="exercise_invalid")
    routine.exercises.clear()
    db.flush()
    for position, item in enumerate(payload, start=1):
        db.add(
            RoutineExercise(routine_id=routine.id, position=position, **item.model_dump())
        )
    db.commit()
    db.refresh(routine)
    return routine
