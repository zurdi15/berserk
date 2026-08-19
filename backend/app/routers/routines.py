from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import Routine, RoutineExercise, User
from ..permissions import TargetUser
from ..schemas.routines import RoutineExerciseIn, RoutineIn, RoutineOut, RoutinePatchIn
from .exercises import get_visible_exercise

router = APIRouter(prefix="/routines", tags=["routines"])


def _can_edit_routine(owner_id: int | None, user: User) -> bool:
    """Mirror de exercises._can_edit: dueño siempre puede; un admin además
    puede sobre plantillas legacy owner_id NULL (ya no producibles desde la
    API tras retirar globalize, pero las filas viejas pueden seguir vivas)."""
    return owner_id == user.id or (owner_id is None and user.is_admin)


def _editable_routine(db: Session, user: User, routine_id: int) -> Routine:
    routine = db.get(Routine, routine_id)
    if routine is None or not _can_edit_routine(routine.owner_id, user):
        raise HTTPException(status_code=404, detail="not_found")
    return routine


def _visible_template(db: Session, user: User, routine_id: int) -> Routine:
    """Rutina usable como plantilla (para duplicar): legacy owner_id NULL,
    marcada is_global por su dueño, o la propia. 404 si no existe o no es
    visible — nunca 403, mismo criterio de no-filtrar que el resto del
    backend."""
    routine = db.get(Routine, routine_id)
    visible = routine is not None and (
        routine.owner_id is None or routine.is_global or routine.owner_id == user.id
    )
    if not visible:
        raise HTTPException(status_code=404, detail="not_found")
    return routine


def _dedupe_routine_name(db: Session, user_id: int, base_name: str) -> str:
    """Sufija con " (2)", " (3)"... si el usuario ya tiene una rutina con
    ese nombre exacto — el copiado nunca pisa un nombre existente."""
    existing = set(
        db.scalars(select(Routine.name).where(Routine.owner_id == user_id))
    )
    if base_name not in existing:
        return base_name
    n = 2
    while True:
        suffix = f" ({n})"
        candidate = base_name[: 60 - len(suffix)] + suffix
        if candidate not in existing:
            return candidate
        n += 1


# TargetUser (no CurrentUser): GET compartible con ?user_id= para que el
# sheet del día (round 10, item 2) resuelva el nombre de la rutina de un
# entreno cuando se está viendo a un atleta compartido, no solo el propio.
# Las mutaciones de abajo siguen en CurrentUser sin cambios.
@router.get("", response_model=list[RoutineOut])
def list_routines(target: TargetUser, db: Session = Depends(get_db)):
    return db.scalars(
        select(Routine).where(Routine.owner_id == target.id).order_by(Routine.name)
    ).all()


# ROUTINES-OPEN: "Plantillas" en RoutineList — legacy owner_id NULL + rutinas
# is_global de OTROS usuarios (las propias ya salen arriba, con su propio
# check en el editor). Registrado antes de GET /{routine_id}: si fuera
# después, FastAPI probaría a castear "templates" a routine_id:int y
# respondería 422 en vez de resolver esta ruta.
@router.get("/templates", response_model=list[RoutineOut])
def list_templates(user: CurrentUser, db: Session = Depends(get_db)):
    return db.scalars(
        select(Routine)
        .where(
            or_(
                Routine.owner_id.is_(None),
                (Routine.is_global.is_(True)) & (Routine.owner_id != user.id),
            )
        )
        .order_by(Routine.name)
    ).all()


@router.post("", response_model=RoutineOut, status_code=201)
def create_routine(payload: RoutineIn, user: CurrentUser, db: Session = Depends(get_db)):
    routine = Routine(owner_id=user.id, **payload.model_dump())
    db.add(routine)
    db.commit()
    return routine


@router.get("/{routine_id}", response_model=RoutineOut)
def get_routine(routine_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    return _editable_routine(db, user, routine_id)


@router.patch("/{routine_id}", response_model=RoutineOut)
def update_routine(
    routine_id: int, payload: RoutinePatchIn, user: CurrentUser, db: Session = Depends(get_db)
):
    routine = _editable_routine(db, user, routine_id)
    data = payload.model_dump(exclude_unset=True)
    # name no es anulable: un null explícito no debe machacarlo
    if "name" in data and data["name"] is None:
        del data["name"]
    for field, value in data.items():
        setattr(routine, field, value)
    db.commit()
    return routine


@router.delete("/{routine_id}", status_code=204)
def delete_routine(routine_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    routine = _editable_routine(db, user, routine_id)
    db.delete(routine)
    db.commit()


@router.put("/{routine_id}/exercises", response_model=RoutineOut)
def replace_exercises(
    routine_id: int,
    payload: list[RoutineExerciseIn],
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    routine = _editable_routine(db, user, routine_id)
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


# ROUTINES-OPEN: "Duplicar" = COPIA, nunca referencia viva — name
# deduplicado, exercises snapshot (no comparten fila con la fuente). Aplica
# también a rutinas PROPIAS (variante rápida de una tuya). Si la fuente
# referencia algún ejercicio que YO no pueda ver (privado de su dueño,
# aunque la rutina en sí sea global) se rechaza entera con 409 en vez de
# copiar una rutina con huecos silenciosos. La copia nunca hereda is_global
# (default False): duplicar no propaga visibilidad, cada dueño decide la suya.
@router.post("/{routine_id}/copy", response_model=RoutineOut, status_code=201)
def copy_routine(routine_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    source = _visible_template(db, user, routine_id)
    for item in source.exercises:
        if get_visible_exercise(db, user.id, item.exercise_id) is None:
            raise HTTPException(status_code=409, detail="routine_has_private_exercises")

    copy = Routine(
        owner_id=user.id,
        name=_dedupe_routine_name(db, user.id, source.name),
        description=source.description,
        rune=source.rune,
        color=source.color,
    )
    db.add(copy)
    db.flush()
    for position, item in enumerate(source.exercises, start=1):
        db.add(
            RoutineExercise(
                routine_id=copy.id,
                position=position,
                exercise_id=item.exercise_id,
                target_sets=item.target_sets,
                target_reps=item.target_reps,
                target_duration_seconds=item.target_duration_seconds,
                target_weight_kg=item.target_weight_kg,
                rest_seconds=item.rest_seconds,
                # v0.5.0 superseries: la copia preserva el grouping — como el
                # snapshot copia TODOS los ejercicios en el mismo orden, la
                # contigüidad (que es lo que define el grupo) viaja intacta
                superset_group=item.superset_group,
                # v0.17.0: los bloques viajan con la copia igual
                block_label=item.block_label,
            )
        )
    db.commit()
    db.refresh(copy)
    return copy
