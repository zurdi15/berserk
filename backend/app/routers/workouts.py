from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import (
    Exercise,
    PersonalRecord,
    Routine,
    ScheduledSession,
    Workout,
    WorkoutExercise,
    WorkoutMuscleGroup,
    WorkoutSet,
    utcnow,
)
from ..permissions import TargetUser
from ..schemas.workouts import (
    ExerciseOrderIn,
    MuscleTagsIn,
    SetIn,
    SetLogOut,
    SetOut,
    WorkoutExerciseIn,
    WorkoutExerciseOut,
    WorkoutExercisePatchIn,
    WorkoutOut,
    WorkoutPatchIn,
    WorkoutStartIn,
)
from ..services.workout_sets import (
    detect_prs,
    session_volume,
    validate_set_fields,
    SET_VALUE_FIELDS,
)
from .exercises import get_visible_exercise, visible_muscle_group_ids

router = APIRouter(prefix="/workouts", tags=["workouts"])


def workout_out(workout: Workout) -> WorkoutOut:
    return WorkoutOut(
        id=workout.id,
        date=workout.date,
        started_at=workout.started_at,
        ended_at=workout.ended_at,
        routine_id=workout.routine_id,
        note=workout.note,
        feeling=workout.feeling,
        exercises=workout.exercises,
        muscle_tag_ids=[t.muscle_group_id for t in workout.muscle_tags],
    )


def _own_workout(db: Session, user_id: int, workout_id: int) -> Workout:
    workout = db.get(Workout, workout_id)
    if workout is None or workout.owner_id != user_id:
        raise HTTPException(status_code=404, detail="not_found")
    return workout


@router.post("", response_model=WorkoutOut, status_code=201)
def start_workout(payload: WorkoutStartIn, user: CurrentUser, db: Session = Depends(get_db)):
    active = db.scalar(
        select(Workout).where(Workout.owner_id == user.id, Workout.ended_at.is_(None))
    )
    if active:
        raise HTTPException(status_code=409, detail="workout_already_active")

    session = None
    routine_id = payload.routine_id
    if payload.scheduled_session_id is not None:
        session = db.get(ScheduledSession, payload.scheduled_session_id)
        if session is None or session.owner_id != user.id:
            raise HTTPException(status_code=404, detail="not_found")
        if session.status == "done":
            raise HTTPException(status_code=409, detail="session_already_done")
        routine_id = routine_id or session.routine_id

    routine = None
    if routine_id is not None:
        routine = db.get(Routine, routine_id)
        if routine is None or routine.owner_id != user.id:
            raise HTTPException(status_code=422, detail="routine_invalid")

    workout = Workout(
        owner_id=user.id,
        date=payload.date or date_type.today(),
        started_at=payload.started_at or utcnow(),
        routine_id=routine_id,
    )
    db.add(workout)
    db.flush()
    if routine is not None:
        for item in routine.exercises:
            db.add(
                WorkoutExercise(
                    workout_id=workout.id,
                    exercise_id=item.exercise_id,
                    position=item.position,
                )
            )
    if session is not None:
        session.status = "done"
        session.workout_id = workout.id
    db.commit()
    db.refresh(workout)
    return workout_out(workout)


@router.get("", response_model=list[WorkoutOut])
def list_workouts(
    target: TargetUser,
    db: Session = Depends(get_db),
    from_date: date_type | None = Query(default=None),
    to_date: date_type | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    query = select(Workout).where(Workout.owner_id == target.id)
    if from_date:
        query = query.where(Workout.date >= from_date)
    if to_date:
        query = query.where(Workout.date <= to_date)
    workouts = db.scalars(
        query.order_by(Workout.date.desc(), Workout.id.desc()).limit(limit).offset(offset)
    ).all()
    return [workout_out(w) for w in workouts]


@router.get("/active", response_model=WorkoutOut)
def active_workout(user: CurrentUser, db: Session = Depends(get_db)):
    workout = db.scalar(
        select(Workout).where(Workout.owner_id == user.id, Workout.ended_at.is_(None))
    )
    if workout is None:
        raise HTTPException(status_code=404, detail="no_active_workout")
    return workout_out(workout)


@router.get("/{workout_id}", response_model=WorkoutOut)
def get_workout(workout_id: int, target: TargetUser, db: Session = Depends(get_db)):
    workout = db.get(Workout, workout_id)
    if workout is None or workout.owner_id != target.id:
        raise HTTPException(status_code=404, detail="not_found")
    return workout_out(workout)


@router.post("/{workout_id}/finish", response_model=WorkoutOut)
def finish_workout(workout_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    workout = _own_workout(db, user.id, workout_id)
    if workout.ended_at is not None:
        raise HTTPException(status_code=409, detail="workout_already_finished")
    workout.ended_at = utcnow()
    db.commit()
    return workout_out(workout)


@router.patch("/{workout_id}", response_model=WorkoutOut)
def update_workout(
    workout_id: int, payload: WorkoutPatchIn, user: CurrentUser, db: Session = Depends(get_db)
):
    workout = _own_workout(db, user.id, workout_id)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(workout, field, value)
    db.commit()
    return workout_out(workout)


@router.delete("/{workout_id}", status_code=204)
def delete_workout(workout_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    workout = _own_workout(db, user.id, workout_id)
    # borrar los PRs logrados en este workout: un récord de una sesión eliminada
    # inflaría el "mejor histórico" contra el que se comparan las siguientes
    set_ids = select(WorkoutSet.id).join(WorkoutExercise).where(
        WorkoutExercise.workout_id == workout.id
    )
    db.execute(delete(PersonalRecord).where(PersonalRecord.set_id.in_(set_ids)))
    db.delete(workout)
    db.commit()


def _own_workout_exercise(
    db: Session, user_id: int, workout_id: int, workout_exercise_id: int
) -> tuple[Workout, WorkoutExercise]:
    workout = _own_workout(db, user_id, workout_id)
    wex = db.get(WorkoutExercise, workout_exercise_id)
    if wex is None or wex.workout_id != workout.id:
        raise HTTPException(status_code=404, detail="not_found")
    return workout, wex


@router.post("/{workout_id}/exercises", response_model=WorkoutExerciseOut, status_code=201)
def add_exercise(
    workout_id: int, payload: WorkoutExerciseIn, user: CurrentUser, db: Session = Depends(get_db)
):
    workout = _own_workout(db, user.id, workout_id)
    if get_visible_exercise(db, user.id, payload.exercise_id) is None:
        raise HTTPException(status_code=422, detail="exercise_invalid")
    position = len(workout.exercises) + 1
    wex = WorkoutExercise(
        workout_id=workout.id,
        exercise_id=payload.exercise_id,
        position=position,
        note=payload.note,
    )
    db.add(wex)
    db.commit()
    return wex


@router.patch("/{workout_id}/exercises/{workout_exercise_id}", response_model=WorkoutExerciseOut)
def update_exercise_note(
    workout_id: int,
    workout_exercise_id: int,
    payload: WorkoutExercisePatchIn,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, wex = _own_workout_exercise(db, user.id, workout_id, workout_exercise_id)
    wex.note = payload.note
    db.commit()
    return wex


@router.delete("/{workout_id}/exercises/{workout_exercise_id}", status_code=204)
def remove_exercise(
    workout_id: int, workout_exercise_id: int, user: CurrentUser, db: Session = Depends(get_db)
):
    workout, wex = _own_workout_exercise(db, user.id, workout_id, workout_exercise_id)
    set_ids = select(WorkoutSet.id).where(WorkoutSet.workout_exercise_id == wex.id)
    db.execute(delete(PersonalRecord).where(PersonalRecord.set_id.in_(set_ids)))
    db.delete(wex)
    for position, item in enumerate(
        [e for e in workout.exercises if e.id != wex.id], start=1
    ):
        item.position = position
    db.commit()


@router.put("/{workout_id}/exercises-order", response_model=WorkoutOut)
def reorder_exercises(
    workout_id: int, payload: ExerciseOrderIn, user: CurrentUser, db: Session = Depends(get_db)
):
    workout = _own_workout(db, user.id, workout_id)
    current_ids = {e.id for e in workout.exercises}
    if set(payload.workout_exercise_ids) != current_ids or len(
        payload.workout_exercise_ids
    ) != len(current_ids):
        raise HTTPException(status_code=422, detail="order_invalid")
    by_id = {e.id: e for e in workout.exercises}
    for position, weid in enumerate(payload.workout_exercise_ids, start=1):
        by_id[weid].position = position
    db.commit()
    db.refresh(workout)
    return workout_out(workout)


@router.put("/{workout_id}/muscle-groups", response_model=WorkoutOut)
def set_muscle_tags(
    workout_id: int, payload: MuscleTagsIn, user: CurrentUser, db: Session = Depends(get_db)
):
    workout = _own_workout(db, user.id, workout_id)
    if not set(payload.muscle_group_ids) <= visible_muscle_group_ids(db, user.id):
        raise HTTPException(status_code=422, detail="muscle_group_invalid")
    workout.muscle_tags.clear()
    db.flush()
    for gid in payload.muscle_group_ids:
        db.add(WorkoutMuscleGroup(workout_id=workout.id, muscle_group_id=gid))
    db.commit()
    db.refresh(workout)
    return workout_out(workout)


@router.post(
    "/{workout_id}/exercises/{workout_exercise_id}/sets",
    response_model=SetLogOut,
    status_code=201,
)
def log_set(
    workout_id: int,
    workout_exercise_id: int,
    payload: SetIn,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    workout, wex = _own_workout_exercise(db, user.id, workout_id, workout_exercise_id)
    exercise = db.get(Exercise, wex.exercise_id)
    try:
        validate_set_fields(exercise.measurement, payload.model_dump())
    except ValueError:
        raise HTTPException(status_code=422, detail="invalid_set_fields") from None
    wset = WorkoutSet(
        workout_exercise_id=wex.id,
        set_number=len(wex.sets) + 1,
        **payload.model_dump(),
    )
    db.add(wset)
    db.flush()
    volume = session_volume(db, workout.id, exercise.id)
    new_records = detect_prs(db, user.id, exercise, wset, volume)
    db.commit()
    return SetLogOut(set=wset, new_records=new_records)


@router.patch(
    "/{workout_id}/exercises/{workout_exercise_id}/sets/{set_id}", response_model=SetOut
)
def update_set(
    workout_id: int,
    workout_exercise_id: int,
    set_id: int,
    payload: SetIn,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Edita una serie ya registrada. No re-detecta PRs: los récords se
    detectan al registrar en vivo; una corrección posterior no celebra nada."""
    _, wex = _own_workout_exercise(db, user.id, workout_id, workout_exercise_id)
    wset = db.get(WorkoutSet, set_id)
    if wset is None or wset.workout_exercise_id != wex.id:
        raise HTTPException(status_code=404, detail="not_found")
    exercise = db.get(Exercise, wex.exercise_id)
    try:
        validate_set_fields(exercise.measurement, payload.model_dump())
    except ValueError:
        raise HTTPException(status_code=422, detail="invalid_set_fields") from None
    for field in (*SET_VALUE_FIELDS, "is_warmup", "rpe"):
        setattr(wset, field, getattr(payload, field))
    db.commit()
    return wset


@router.delete(
    "/{workout_id}/exercises/{workout_exercise_id}/sets/{set_id}", status_code=204
)
def delete_set(
    workout_id: int,
    workout_exercise_id: int,
    set_id: int,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, wex = _own_workout_exercise(db, user.id, workout_id, workout_exercise_id)
    wset = db.get(WorkoutSet, set_id)
    if wset is None or wset.workout_exercise_id != wex.id:
        raise HTTPException(status_code=404, detail="not_found")
    db.execute(delete(PersonalRecord).where(PersonalRecord.set_id == wset.id))
    remaining = [s for s in wex.sets if s.id != wset.id]
    db.delete(wset)
    for number, item in enumerate(remaining, start=1):
        item.set_number = number
    db.commit()
