from datetime import date as date_type
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
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
    SupersetGroupsIn,
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
from ..services.workouts import sync_derived_muscle_groups
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
        stretched=workout.stretched,
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
    # v0.6.0 offline: dedupe de replay ANTES de cualquier validación — si el
    # client_id ya existe, este start YA ocurrió (las validaciones pasaron
    # entonces); el reintento solo necesita la respuesta que se perdió
    if payload.client_id is not None:
        existing = db.scalar(
            select(Workout).where(
                Workout.owner_id == user.id, Workout.client_id == payload.client_id
            )
        )
        if existing is not None:
            return workout_out(existing)

    if payload.finished and payload.date is None:
        raise HTTPException(status_code=422, detail="date_required")

    # un entreno retroactivo llega ya cerrado (ended_at != None): no compite
    # por el hueco "activo" (el índice único parcial solo mira ended_at IS
    # NULL), así que el chequeo de abajo directamente no le aplica — se puede
    # registrar un entreno pasado mientras hay uno en curso ahora mismo
    if not payload.finished:
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

    if payload.finished:
        # duración real desconocida en un registro retroactivo: started==ended
        # mantiene las stats honestas (total_gym_seconds += 0) en vez de
        # inventar una duración que nunca se midió. Mediodía naive-UTC es un
        # placeholder estable (no un intento de acertar la hora real del día)
        started_at = datetime.combine(payload.date, time(12, 0))
        ended_at = started_at
    else:
        started_at = payload.started_at or utcnow()
        ended_at = None

    workout = Workout(
        owner_id=user.id,
        date=payload.date or date_type.today(),
        started_at=started_at,
        ended_at=ended_at,
        routine_id=routine_id,
        client_id=payload.client_id,
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
                    # item 11: el descanso configurado en la rutina es el
                    # punto de partida del entreno — el usuario lo puede
                    # cambiar luego solo para ESTE entreno (rest_seconds del
                    # WorkoutExercise, no toca la rutina de origen)
                    rest_seconds=item.rest_seconds,
                    # v0.5.0 superseries: el grouping también es snapshot de
                    # la rutina (vale igual para el entreno en vivo y el
                    # retroactivo finished=True — ambos pasan por aquí)
                    superset_group=item.superset_group,
                )
            )
        db.flush()
        # item 4: los grupos musculares del entreno se derivan desde el
        # instante en que trae ejercicios de la rutina, no solo al añadirlos
        # uno a uno luego
        sync_derived_muscle_groups(db, workout.id)
    if session is not None:
        session.status = "done"
        session.workout_id = workout.id
    # el chequeo de arriba es el camino feliz; el índice único parcial es el
    # árbitro real ante dos requests concurrentes ganando la carrera del CTA
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="workout_already_active") from None
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
    # v0.6.0 offline: idempotente — un replay de "terminar" sobre un entreno
    # ya cerrado devuelve el entreno tal cual en vez de 409: el resultado que
    # el cliente pedía (entreno terminado) ya es verdad. El flujo online no
    # cambia: la UI nunca ofrece terminar dos veces (el botón vive solo en el
    # entreno activo), así que el 409 solo protegía contra este mismo replay.
    if workout.ended_at is not None:
        return workout_out(workout)
    workout.ended_at = utcnow()
    db.commit()
    return workout_out(workout)


@router.patch("/{workout_id}", response_model=WorkoutOut)
def update_workout(
    workout_id: int, payload: WorkoutPatchIn, user: CurrentUser, db: Session = Depends(get_db)
):
    workout = _own_workout(db, user.id, workout_id)
    data = payload.model_dump(exclude_unset=True)
    # date no es anulable: un null explícito no debe machacarla
    if "date" in data and data["date"] is None:
        del data["date"]

    started_time = data.pop("started_time", None)
    duration_minutes = data.pop("duration_minutes", None)

    # item 5 (post-0.3.0): el timing retroactivo solo tiene sentido sobre un
    # entreno YA CERRADO (ended_at IS NOT NULL, mismo criterio que finish_workout
    # usa para "activo"). Uno activo tiene su started_at/ended_at gobernados
    # por el flujo en vivo (start_workout/finish_workout) — dejar que el editor
    # retroactivo los pise a mitad de sesión rompería esa fuente de verdad. Se
    # elige 409 explícito en vez de un no-op silencioso: el cliente necesita
    # saber que el patch no se aplicó.
    if (started_time is not None or duration_minutes is not None) and workout.ended_at is None:
        raise HTTPException(status_code=409, detail="workout_not_finished")

    # orden 1) fecha: si cambia, RE-BASA started_at/ended_at YA EXISTENTES a
    # la nueva fecha conservando hora-del-día y duración — fix del hueco de
    # round 10, donde cambiar la fecha dejaba los timestamps en el día viejo
    if "date" in data:
        new_date = data.pop("date")
        if workout.started_at is not None:
            old_started = workout.started_at
            rebased_started = datetime.combine(new_date, old_started.time())
            if workout.ended_at is not None:
                duration = workout.ended_at - old_started
                workout.ended_at = rebased_started + duration
            workout.started_at = rebased_started
        workout.date = new_date

    # 2) started_time: fija la hora de inicio sobre el date ya resuelto
    # arriba. Conserva la duración existente al desplazar started_at (si no
    # se hiciera, un started_at==ended_at original — el placeholder de 8A —
    # dejaría ended_at ANTES que el nuevo started_at, una duración negativa)
    if started_time is not None:
        old_started = workout.started_at
        new_started = datetime.combine(workout.date, started_time)
        if workout.ended_at is not None and old_started is not None:
            duration = workout.ended_at - old_started
            workout.ended_at = new_started + duration
        workout.started_at = new_started

    # 3) duration_minutes: recalcula ended_at desde el started_at YA resuelto
    # arriba (tras un posible cambio de fecha/hora en los pasos previos), no
    # el original — para que fecha+hora+duración en el mismo PATCH compongan
    # coherentemente en vez de pisarse entre sí
    if duration_minutes is not None:
        if workout.started_at is None:
            raise HTTPException(status_code=422, detail="started_at_required")
        workout.ended_at = workout.started_at + timedelta(minutes=duration_minutes)

    for field, value in data.items():
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
    # borrar el entreno de una sesión de HOY/futuro la devuelve a planificada:
    # un "done" colgando (con workout_id a NULL por el SET NULL de la FK)
    # bloquearía reutilizarla. Pero un "planned" en el PASADO no tiene ningún
    # sentido — ese hueco ya no se puede "hacer" retroactivamente, así que la
    # sesión se borra entera en vez de revivirla zombie (v0.3.0, item 1: "al
    # borrar un entreno anterior, se pone como programado. Mal.")
    linked_sessions = db.scalars(
        select(ScheduledSession).where(
            ScheduledSession.workout_id == workout.id,
            ScheduledSession.owner_id == user.id,
        )
    ).all()
    for linked in linked_sessions:
        if linked.date < date_type.today():
            db.delete(linked)
        else:
            linked.status = "planned"
            linked.workout_id = None
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
    # v0.6.0 offline: dedupe de replay (ver start_workout)
    if payload.client_id is not None:
        existing = next(
            (e for e in workout.exercises if e.client_id == payload.client_id), None
        )
        if existing is not None:
            return existing
    if get_visible_exercise(db, user.id, payload.exercise_id) is None:
        raise HTTPException(status_code=422, detail="exercise_invalid")
    position = len(workout.exercises) + 1
    # item 11: si el entreno viene de una rutina y este ejercicio forma parte
    # de ella (añadido suelto, p.ej. tras haberlo quitado y devuelto a la
    # tarjeta), hereda su rest_seconds igual que los copiados al empezar el
    # entreno; si no, None (ad-hoc) — cae al default general en rest.ts
    rest_seconds = None
    if workout.routine_id is not None:
        routine = db.get(Routine, workout.routine_id)
        routine_item = next(
            (e for e in (routine.exercises if routine else []) if e.exercise_id == payload.exercise_id),
            None,
        )
        rest_seconds = routine_item.rest_seconds if routine_item else None
    # v0.5.0 superseries: un ejercicio añadido ad-hoc SIEMPRE nace suelto
    # (superset_group NULL, el default del modelo) — aunque el mismo ejercicio
    # estuviera agrupado en la rutina de origen: se añade AL FINAL, así que la
    # contigüidad con su grupo original no existe de todos modos
    wex = WorkoutExercise(
        workout_id=workout.id,
        exercise_id=payload.exercise_id,
        position=position,
        note=payload.note,
        rest_seconds=rest_seconds,
        client_id=payload.client_id,
    )
    db.add(wex)
    db.flush()
    # fix M9 (revisión): sync_derived_muscle_groups ahora consulta
    # workout_exercises ella misma (ver services/workouts.py), así que ya no
    # hace falta precomputar exercise_ids aquí solo para pasárselo
    sync_derived_muscle_groups(db, workout.id)
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
    # cuerpo vacío = no-op; {"note": null} sí limpia la nota (es anulable)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(wex, field, value)
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
    db.flush()
    sync_derived_muscle_groups(db, workout.id)
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


@router.put("/{workout_id}/superset-groups", response_model=WorkoutOut)
def set_superset_groups(
    workout_id: int, payload: SupersetGroupsIn, user: CurrentUser, db: Session = Depends(get_db)
):
    """v0.7.0: reasignación en bloque del grouping de superseries de un
    entreno EN VIVO (zurdi vetó el v1 solo-en-rutina). Mismo contrato de
    completitud que reorder_exercises: el payload debe cubrir EXACTAMENTE los
    ejercicios del entreno — el cliente siempre manda el estado normalizado
    entero (ver lib/supersets.ts), así que un payload parcial es un bug, no
    un caso a medio soportar."""
    workout = _own_workout(db, user.id, workout_id)
    current_ids = {e.id for e in workout.exercises}
    payload_ids = [g.workout_exercise_id for g in payload.groups]
    if set(payload_ids) != current_ids or len(payload_ids) != len(current_ids):
        raise HTTPException(status_code=422, detail="superset_groups_invalid")
    by_id = {e.id: e for e in workout.exercises}
    for item in payload.groups:
        by_id[item.workout_exercise_id].superset_group = item.superset_group
    db.commit()
    db.refresh(workout)
    return workout_out(workout)


@router.put("/{workout_id}/muscle-groups", response_model=WorkoutOut)
def set_muscle_tags(
    workout_id: int, payload: MuscleTagsIn, user: CurrentUser, db: Session = Depends(get_db)
):
    """Etiquetado MANUAL, superseded por el derivado del item 4 (round
    v0.3.0): el frontend ya no lo llama (los chips de WorkoutView/
    WorkoutEditView pasaron a ser de solo lectura, derivados de los
    ejercicios del entreno — ver sync_derived_muscle_groups). Se conserva el
    endpoint por si algún consumidor externo lo usa, pero cualquier alta/baja
    de ejercicio posterior recalcula y PISA lo que se fije aquí."""
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
    # v0.6.0 offline: dedupe de replay (ver start_workout) — sin new_records:
    # los PRs de la serie original ya se detectaron en el primer intento
    if payload.client_id is not None:
        existing = next((s for s in wex.sets if s.client_id == payload.client_id), None)
        if existing is not None:
            return SetLogOut(set=existing, new_records=[])
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
    # entreno ya cerrado (terminado en vivo o retroactivo, da igual el
    # origen): el PR se fecha al día del entreno, no al instante en que se
    # registra la serie — uno en curso (ended_at None) sigue fechando a "ahora"
    achieved_at = workout.started_at if workout.ended_at is not None else None
    new_records = detect_prs(db, user.id, exercise, wset, volume, achieved_at=achieved_at)
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
    """Edita una serie ya registrada. No re-detecta PRs para celebrar: los
    récords se celebran al registrar en vivo, una corrección posterior no
    celebra nada. Pero sí hay que mantenerlos honestos: se barren los PRs de
    esta serie y se re-detectan en silencio contra el valor corregido."""
    workout, wex = _own_workout_exercise(db, user.id, workout_id, workout_exercise_id)
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
    # el volumen se calcula con una query aparte (autoflush está desactivado):
    # sin este flush leería el peso/reps viejos de la serie que se acaba de editar
    db.flush()
    # una corrección no celebra nada, pero tampoco puede dejar récords
    # fantasma: se barren los PRs de la serie y se re-detectan en silencio
    db.execute(delete(PersonalRecord).where(PersonalRecord.set_id == wset.id))
    volume = session_volume(db, workout_id, exercise.id)
    # mismo criterio que log_set: si el entreno ya está cerrado, el PR
    # re-detectado se fecha al día del entreno, no al instante de la edición
    achieved_at = workout.started_at if workout.ended_at is not None else None
    detect_prs(db, user.id, exercise, wset, volume, achieved_at=achieved_at)
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
