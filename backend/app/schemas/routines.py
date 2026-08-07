from pydantic import BaseModel, Field


class RoutineIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = Field(None, max_length=300)
    rune: str | None = Field(None, max_length=20)
    color: str | None = Field(None, max_length=30)
    # ROUTINES-OPEN: el check "Global" del editor se puede marcar ya al
    # crear, no solo al editar (a diferencia del viejo flujo globalize)
    is_global: bool = False


class RoutinePatchIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=60)
    description: str | None = Field(None, max_length=300)
    rune: str | None = Field(None, max_length=20)
    color: str | None = Field(None, max_length=30)
    # ROUTINES-OPEN: check "Global" del editor de rutinas, disponible para
    # CUALQUIER usuario sobre su propia rutina (renombrado desde is_public,
    # mismo comportamiento) — None = no lo toques, igual que
    # ExercisePatchIn.is_public
    is_global: bool | None = None


class RoutineExerciseIn(BaseModel):
    exercise_id: int
    target_sets: int = Field(3, ge=1, le=20)
    target_reps: int | None = Field(None, ge=1, le=200)
    target_weight_kg: float | None = Field(None, gt=0, le=1000)
    rest_seconds: int | None = Field(None, ge=5, le=900)


class RoutineExerciseOut(BaseModel):
    id: int
    exercise_id: int
    position: int
    target_sets: int
    target_reps: int | None
    target_weight_kg: float | None
    rest_seconds: int | None

    model_config = {"from_attributes": True}


class RoutineOut(BaseModel):
    id: int
    owner_id: int | None
    name: str
    description: str | None
    rune: str | None
    color: str | None
    # ROUTINES-OPEN: is_global alimenta el check "Global" del editor;
    # owner_username la atribución en la lista unificada (None para una
    # plantilla legacy owner_id NULL — esas se atribuyen como "global" en
    # el frontend, no a un usuario)
    is_global: bool
    owner_username: str | None
    exercises: list[RoutineExerciseOut]

    model_config = {"from_attributes": True}
