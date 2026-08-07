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


class WorkoutExercisePatchIn(BaseModel):
    note: str | None = Field(None, max_length=300)
    # mismo rango que RoutineExercise.rest_seconds (schemas/routines.py); un
    # PATCH con {"rest_seconds": null} explícito limpia el override (vuelve
    # a caer al target de rutina/default) — sí es una semántica válida aquí,
    # a diferencia del "note" de WorkoutPatchIn.date que nunca se anula
    rest_seconds: int | None = Field(None, ge=5, le=900)


class ExerciseOrderIn(BaseModel):
    workout_exercise_ids: list[int] = Field(min_length=1)


class MuscleTagsIn(BaseModel):
    muscle_group_ids: list[int]


class SetIn(BaseModel):
    reps: int | None = Field(None, ge=1, le=500)
    weight_kg: float | None = Field(None, gt=0, le=1000)
    duration_seconds: int | None = Field(None, ge=1, le=86400)
    distance_m: float | None = Field(None, gt=0, le=1000000)
    is_warmup: bool = False
    rpe: int | None = Field(None, ge=1, le=10)


class SetLogOut(BaseModel):
    set: SetOut
    new_records: list[PersonalRecordOut]
