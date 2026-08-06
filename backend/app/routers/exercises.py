from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import Exercise, ExerciseMuscleGroup, MuscleGroup, RoutineExercise, User, WorkoutExercise
from ..permissions import TargetUser
from ..schemas.catalog import (
    ExerciseIn,
    ExerciseMuscleLink,
    ExerciseOut,
    ExercisePatchIn,
    MuscleGroupIn,
    MuscleGroupOut,
    MuscleGroupPatchIn,
)

router = APIRouter(tags=["catalog"])


def exercise_out(exercise: Exercise) -> ExerciseOut:
    return ExerciseOut(
        id=exercise.id,
        name_es=exercise.name_es,
        name_en=exercise.name_en,
        measurement=exercise.measurement,
        owner_id=exercise.owner_id,
        muscle_groups=[
            ExerciseMuscleLink(muscle_group_id=l.muscle_group_id, is_primary=l.is_primary)
            for l in exercise.muscle_links
        ],
    )


def visible_muscle_group_ids(db: Session, user_id: int) -> set[int]:
    rows = db.scalars(
        select(MuscleGroup.id).where(
            or_(MuscleGroup.owner_id.is_(None), MuscleGroup.owner_id == user_id)
        )
    ).all()
    return set(rows)


def get_visible_exercise(db: Session, user_id: int, exercise_id: int) -> Exercise | None:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or (exercise.owner_id is not None and exercise.owner_id != user_id):
        return None
    return exercise


def _can_edit(owner_id: int | None, user: User) -> bool:
    """Dueño siempre puede; un admin además puede sobre filas globales
    (owner_id NULL, el catálogo predefinido) — item 5."""
    return owner_id == user.id or (owner_id is None and user.is_admin)


def _apply_links(db: Session, exercise: Exercise, links: list[ExerciseMuscleLink], user_id: int) -> None:
    if not set(l.muscle_group_id for l in links) <= visible_muscle_group_ids(db, user_id):
        raise HTTPException(status_code=422, detail="muscle_group_invalid")
    exercise.muscle_links.clear()
    db.flush()
    for link in links:
        db.add(
            ExerciseMuscleGroup(
                exercise_id=exercise.id,
                muscle_group_id=link.muscle_group_id,
                is_primary=link.is_primary,
            )
        )


@router.get("/muscle-groups", response_model=list[MuscleGroupOut])
def list_muscle_groups(target: TargetUser, db: Session = Depends(get_db)):
    return db.scalars(
        select(MuscleGroup)
        .where(or_(MuscleGroup.owner_id.is_(None), MuscleGroup.owner_id == target.id))
        .order_by(MuscleGroup.id)
    ).all()


@router.post("/muscle-groups", response_model=MuscleGroupOut, status_code=201)
def create_muscle_group(payload: MuscleGroupIn, user: CurrentUser, db: Session = Depends(get_db)):
    if payload.is_global and not user.is_admin:
        raise HTTPException(status_code=403, detail="admin_only")
    owner_id = None if payload.is_global else user.id
    scope = MuscleGroup.owner_id.is_(None) if owner_id is None else MuscleGroup.owner_id == owner_id
    if db.scalar(select(MuscleGroup).where(scope, MuscleGroup.slug == payload.slug)):
        raise HTTPException(status_code=409, detail="slug_taken")
    group = MuscleGroup(
        slug=payload.slug, name_es=payload.name_es, name_en=payload.name_en, owner_id=owner_id
    )
    db.add(group)
    db.commit()
    return group


@router.patch("/muscle-groups/{group_id}", response_model=MuscleGroupOut)
def update_muscle_group(
    group_id: int, payload: MuscleGroupPatchIn, user: CurrentUser, db: Session = Depends(get_db)
):
    group = db.get(MuscleGroup, group_id)
    if group is None or not _can_edit(group.owner_id, user):
        raise HTTPException(status_code=404, detail="not_found")
    if payload.slug is not None and payload.slug != group.slug:
        scope = (
            MuscleGroup.owner_id.is_(None)
            if group.owner_id is None
            else MuscleGroup.owner_id == group.owner_id
        )
        if db.scalar(select(MuscleGroup).where(scope, MuscleGroup.slug == payload.slug)):
            raise HTTPException(status_code=409, detail="slug_taken")
        group.slug = payload.slug
    if payload.name_es is not None:
        group.name_es = payload.name_es
    if payload.name_en is not None:
        group.name_en = payload.name_en
    db.commit()
    return group


@router.delete("/muscle-groups/{group_id}", status_code=204)
def delete_muscle_group(group_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    group = db.get(MuscleGroup, group_id)
    if group is None or not _can_edit(group.owner_id, user):
        raise HTTPException(status_code=404, detail="not_found")
    if db.scalar(
        select(ExerciseMuscleGroup).where(ExerciseMuscleGroup.muscle_group_id == group_id)
    ):
        raise HTTPException(status_code=409, detail="muscle_group_in_use")
    db.delete(group)
    db.commit()


@router.get("/exercises", response_model=list[ExerciseOut])
def list_exercises(
    target: TargetUser,
    db: Session = Depends(get_db),
    q: str | None = Query(default=None, max_length=80),
    muscle_group_id: int | None = Query(default=None),
    measurement: str | None = Query(default=None),
):
    query = select(Exercise).where(
        or_(Exercise.owner_id.is_(None), Exercise.owner_id == target.id)
    )
    if q:
        pattern = f"%{q}%"
        query = query.where(or_(Exercise.name_es.ilike(pattern), Exercise.name_en.ilike(pattern)))
    if measurement:
        query = query.where(Exercise.measurement == measurement)
    if muscle_group_id is not None:
        query = query.join(ExerciseMuscleGroup).where(
            ExerciseMuscleGroup.muscle_group_id == muscle_group_id
        )
    exercises = db.scalars(query.order_by(Exercise.name_en)).all()
    return [exercise_out(e) for e in exercises]


@router.post("/exercises", response_model=ExerciseOut, status_code=201)
def create_exercise(payload: ExerciseIn, user: CurrentUser, db: Session = Depends(get_db)):
    if payload.is_global and not user.is_admin:
        raise HTTPException(status_code=403, detail="admin_only")
    owner_id = None if payload.is_global else user.id
    exercise = Exercise(
        name_es=payload.name_es,
        name_en=payload.name_en,
        measurement=payload.measurement,
        owner_id=owner_id,
    )
    db.add(exercise)
    db.flush()
    _apply_links(db, exercise, payload.muscle_groups, user.id)
    db.commit()
    return exercise_out(exercise)


@router.patch("/exercises/{exercise_id}", response_model=ExerciseOut)
def update_exercise(
    exercise_id: int, payload: ExercisePatchIn, user: CurrentUser, db: Session = Depends(get_db)
):
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or not _can_edit(exercise.owner_id, user):
        raise HTTPException(status_code=404, detail="not_found")
    if payload.name_es is not None:
        exercise.name_es = payload.name_es
    if payload.name_en is not None:
        exercise.name_en = payload.name_en
    if payload.muscle_groups is not None:
        _apply_links(db, exercise, payload.muscle_groups, user.id)
    db.commit()
    return exercise_out(exercise)


@router.delete("/exercises/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or not _can_edit(exercise.owner_id, user):
        raise HTTPException(status_code=404, detail="not_found")
    in_use = db.scalar(
        select(RoutineExercise).where(RoutineExercise.exercise_id == exercise_id)
    ) or db.scalar(
        select(WorkoutExercise).where(WorkoutExercise.exercise_id == exercise_id)
    )
    if in_use:
        raise HTTPException(status_code=409, detail="exercise_in_use")
    db.delete(exercise)
    db.commit()
