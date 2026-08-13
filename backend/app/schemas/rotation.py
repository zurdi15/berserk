from pydantic import BaseModel, Field

from .routines import RoutineOut


class RotationIn(BaseModel):
    # lista completa y ordenada cada vez (contrato de completitud); vacía
    # borra el plan. Techo holgado: nadie rota 20 rutinas.
    routine_ids: list[int] = Field(max_length=20)


class RotationOut(BaseModel):
    routines: list[RoutineOut]
    # índice en `routines` de la que toca; None sin plan
    next_position: int | None


class RotationNextIn(BaseModel):
    routine_id: int
