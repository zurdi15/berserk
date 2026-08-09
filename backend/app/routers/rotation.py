"""v0.14.0 — plan rotatorio de rutinas (zurdi: "rutina semanal rotatoria...
si una semana no completo todas, la siguiente empieza por la que no hice:
siempre en orden").

El "te toca" NO es estado guardado: se deriva del último entreno TERMINADO
cuya rutina pertenezca a la rotación — el siguiente en el orden, cíclico.
Así ni las semanas a medias ni editar el plan desincronizan nada, y saltarse
el orden a mano simplemente mueve el puntero (la sugerencia siempre es
"la siguiente a la última hecha")."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import RotationEntry, Routine, Workout
from ..schemas.rotation import RotationIn, RotationOut
from .routines import _visible_template

router = APIRouter(prefix="/rotation", tags=["rotation"])


def _entries(db: Session, owner_id: int) -> list[RotationEntry]:
    return list(
        db.scalars(
            select(RotationEntry)
            .where(RotationEntry.owner_id == owner_id)
            .order_by(RotationEntry.position)
        ).all()
    )


def _next_position(db: Session, owner_id: int, entries: list[RotationEntry]) -> int:
    if not entries:
        return 0
    rotation_ids = [entry.routine_id for entry in entries]
    last_routine_id = db.scalar(
        select(Workout.routine_id)
        .where(
            Workout.owner_id == owner_id,
            Workout.ended_at.is_not(None),
            Workout.routine_id.in_(rotation_ids),
        )
        .order_by(Workout.date.desc(), Workout.id.desc())
        .limit(1)
    )
    if last_routine_id is None:
        return 0
    last_position = next(
        index for index, entry in enumerate(entries) if entry.routine_id == last_routine_id
    )
    return (last_position + 1) % len(entries)


def _serialize(db: Session, user_id: int) -> RotationOut:
    entries = _entries(db, user_id)
    routines = {
        routine.id: routine
        for routine in db.scalars(
            select(Routine).where(Routine.id.in_([e.routine_id for e in entries]))
        ).all()
    } if entries else {}
    next_position = _next_position(db, user_id, entries)
    return RotationOut(
        routines=[routines[entry.routine_id] for entry in entries],
        next_position=next_position if entries else None,
    )


@router.get("", response_model=RotationOut)
def get_rotation(user: CurrentUser, db: Session = Depends(get_db)):
    return _serialize(db, user.id)


@router.put("", response_model=RotationOut)
def replace_rotation(payload: RotationIn, user: CurrentUser, db: Session = Depends(get_db)):
    # contrato de completitud (mismo criterio que superset-groups): la lista
    # entera cada vez — orden = orden del array; vacía = borrar el plan
    if len(set(payload.routine_ids)) != len(payload.routine_ids):
        raise HTTPException(status_code=422, detail="rotation_duplicate_routine")
    for routine_id in payload.routine_ids:
        # visible/usable como plantilla = arrancable desde la rotación
        _visible_template(db, user, routine_id)
    for entry in _entries(db, user.id):
        db.delete(entry)
    db.flush()
    for position, routine_id in enumerate(payload.routine_ids):
        db.add(RotationEntry(owner_id=user.id, position=position, routine_id=routine_id))
    db.commit()
    return _serialize(db, user.id)
