from typing import Literal

from pydantic import BaseModel, Field, field_validator


class MuscleGroupOut(BaseModel):
    id: int
    slug: str
    name_es: str
    name_en: str
    owner_id: int | None

    model_config = {"from_attributes": True}


class MuscleGroupIn(BaseModel):
    slug: str = Field(min_length=2, max_length=30, pattern=r"^[a-z0-9-]+$")
    name_es: str = Field(min_length=1, max_length=50)
    name_en: str = Field(min_length=1, max_length=50)
    is_global: bool = False


class MuscleGroupPatchIn(BaseModel):
    # slug dobla como identificador de runa (ver runeResolve.ts): editarlo es
    # lo que el picker de runas de grupos predefinidos (item 5) acaba enviando
    slug: str | None = Field(None, min_length=2, max_length=30, pattern=r"^[a-z0-9-]+$")
    name_es: str | None = Field(None, min_length=1, max_length=50)
    name_en: str | None = Field(None, min_length=1, max_length=50)


class ExerciseMuscleLink(BaseModel):
    muscle_group_id: int
    is_primary: bool = False


def _exactly_one_primary(links: list[ExerciseMuscleLink]) -> list[ExerciseMuscleLink]:
    if sum(1 for l in links if l.is_primary) != 1:
        raise ValueError("one_primary_required")
    return links


class ExerciseIn(BaseModel):
    name_es: str = Field(min_length=1, max_length=80)
    name_en: str = Field(min_length=1, max_length=80)
    measurement: Literal["strength", "bodyweight", "timed", "cardio"]
    muscle_groups: list[ExerciseMuscleLink] = Field(min_length=1)
    # item 3: ejercicio global (owner_id null, visible a todo el mundo) —
    # solo un admin puede pedirlo, igual que MuscleGroupIn.is_global
    is_global: bool = False

    @field_validator("muscle_groups")
    @classmethod
    def _one_primary(cls, v):
        return _exactly_one_primary(v)


class ExercisePatchIn(BaseModel):
    name_es: str | None = Field(None, min_length=1, max_length=80)
    name_en: str | None = Field(None, min_length=1, max_length=80)
    muscle_groups: list[ExerciseMuscleLink] | None = Field(None, min_length=1)

    @field_validator("muscle_groups")
    @classmethod
    def _one_primary(cls, v):
        return v if v is None else _exactly_one_primary(v)


class ExerciseOut(BaseModel):
    id: int
    name_es: str
    name_en: str
    measurement: str
    owner_id: int | None
    muscle_groups: list[ExerciseMuscleLink]
