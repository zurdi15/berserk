from datetime import date as date_type
from datetime import datetime, time

from pydantic import BaseModel, Field


class WorkoutStartIn(BaseModel):
    date: date_type | None = None
    routine_id: int | None = None
    scheduled_session_id: int | None = None
    started_at: datetime | None = None
    # entreno retroactivo: ya terminado al crearlo (ver start_workout), así que
    # no compite por el hueco "activo" y exige date (no hay "hoy" implícito)
    finished: bool = False
    # v0.6.0 offline: UUID generado por el cliente para replay idempotente de
    # la cola offline (ver Workout.client_id en models.py) — opcional: el
    # flujo online normal no lo manda
    client_id: str | None = Field(None, max_length=36)


class WorkoutPatchIn(BaseModel):
    date: date_type | None = None
    note: str | None = Field(None, max_length=500)
    feeling: int | None = Field(None, ge=1, le=5)
    # item 8: bool "normal" (no anulable, sin semántica de "sin fijar" — un
    # PATCH sin este campo simplemente no lo toca, vía exclude_unset)
    stretched: bool | None = None
    # item 5 (post-0.3.0): timing editable de un entreno retroactivo — 8A lo
    # crea con started_at == ended_at (duración 0), lo que sesga las stats de
    # tiempo de gym. Solo aplican sobre un entreno YA CERRADO (ver
    # update_workout); started_time fija la hora de inicio sobre la fecha del
    # entreno, duration_minutes recalcula ended_at desde ahí.
    started_time: time | None = None
    duration_minutes: int | None = Field(None, ge=0, le=600)


class SetOut(BaseModel):
    id: int
    set_number: int
    reps: int | None
    weight_kg: float | None
    duration_seconds: int | None
    distance_m: float | None
    is_warmup: bool
    rpe: int | None
    completed_at: datetime

    model_config = {"from_attributes": True}


class WorkoutExerciseOut(BaseModel):
    id: int
    exercise_id: int
    position: int
    note: str | None
    # item 11: descanso override de ESTE ejercicio en ESTE entreno; None cae
    # al target de la rutina de origen o al default general (ver rest.ts)
    rest_seconds: int | None
    # v0.5.0 superseries: copiado de la rutina al empezar (None = suelto /
    # ad-hoc); en v1 NO es parcheable mid-workout (no está en
    # WorkoutExercisePatchIn a propósito) — solo gobierna render agrupado y
    # gating del auto-descanso en el frontend
    superset_group: int | None
    # v0.17.0 bloques: snapshot de la rutina (o etiqueta del alta ad-hoc en
    # el stepper) — None = sin bloque
    block_label: str | None
    sets: list[SetOut]

    model_config = {"from_attributes": True}


class WorkoutOut(BaseModel):
    id: int
    date: date_type
    started_at: datetime | None
    ended_at: datetime | None
    routine_id: int | None
    note: str | None
    feeling: int | None
    stretched: bool
    exercises: list[WorkoutExerciseOut]
    muscle_tag_ids: list[int] = []


class PersonalRecordOut(BaseModel):
    id: int
    exercise_id: int
    kind: str
    value: float
    achieved_at: datetime

    model_config = {"from_attributes": True}


class WorkoutExerciseIn(BaseModel):
    exercise_id: int
    note: str | None = Field(None, max_length=300)
    # v0.17.0 bloques: en el stepper del entreno, añadir mientras miras un
    # bloque mete el ejercicio en ESE bloque (None = sin bloque, como antes)
    block_label: str | None = Field(None, min_length=1, max_length=40)
    # v0.6.0 offline: ver WorkoutStartIn.client_id
    client_id: str | None = Field(None, max_length=36)


class WorkoutExercisePatchIn(BaseModel):
    note: str | None = Field(None, max_length=300)
    # mismo rango que RoutineExercise.rest_seconds (schemas/routines.py); un
    # PATCH con {"rest_seconds": null} explícito limpia el override (vuelve
    # a caer al target de rutina/default) — sí es una semántica válida aquí,
    # a diferencia del "note" de WorkoutPatchIn.date que nunca se anula
    rest_seconds: int | None = Field(None, ge=5, le=900)


class ExerciseOrderIn(BaseModel):
    workout_exercise_ids: list[int] = Field(min_length=1)


# v0.7.0 (zurdi: "no veo cómo añadir una superserie a un entrenamiento"):
# reasignación EN BLOQUE del grouping de un entreno en vivo — espejo de
# ExerciseOrderIn: el cliente manda el estado completo normalizado (lib
# supersets.ts), nunca deltas por ejercicio
class SupersetGroupIn(BaseModel):
    workout_exercise_id: int
    superset_group: int | None = Field(None, ge=0)


class SupersetGroupsIn(BaseModel):
    groups: list[SupersetGroupIn] = Field(min_length=1)


class MuscleTagsIn(BaseModel):
    muscle_group_ids: list[int]


class SetIn(BaseModel):
    reps: int | None = Field(None, ge=1, le=500)
    weight_kg: float | None = Field(None, gt=0, le=1000)
    duration_seconds: int | None = Field(None, ge=1, le=86400)
    distance_m: float | None = Field(None, gt=0, le=1000000)
    is_warmup: bool = False
    rpe: int | None = Field(None, ge=1, le=10)
    # v0.6.0 offline: ver WorkoutStartIn.client_id — solo lo usa log_set
    # (dedupe de replay + se persiste vía **model_dump()); update_set lo
    # ignora (su setattr itera solo los campos de valor)
    client_id: str | None = Field(None, max_length=36)


class SetLogOut(BaseModel):
    set: SetOut
    new_records: list[PersonalRecordOut]
