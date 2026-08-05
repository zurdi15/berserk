from pydantic import BaseModel, Field


class RoutineIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = Field(None, max_length=300)
    rune: str | None = Field(None, max_length=20)
    color: str | None = Field(None, max_length=30)


class RoutinePatchIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=60)
    description: str | None = Field(None, max_length=300)
    rune: str | None = Field(None, max_length=20)
    color: str | None = Field(None, max_length=30)


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
    name: str
    description: str | None
    rune: str | None
    color: str | None
    exercises: list[RoutineExerciseOut]

    model_config = {"from_attributes": True}
