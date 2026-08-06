from typing import Literal

from pydantic import BaseModel, Field, field_validator


class MuscleGroupOut(BaseModel):
    id: int
    slug: str
    name_es: str
    name_en: str
    owner_id: int | None
    rune: str | None

    model_config = {"from_attributes": True}


class MuscleGroupIn(BaseModel):
    slug: str = Field(min_length=2, max_length=30, pattern=r"^[a-z0-9-]+$")
    name_es: str = Field(min_length=1, max_length=50)
    name_en: str = Field(min_length=1, max_length=50)
    is_global: bool = False
    # item 14: runa dedicada, opcional y libre — el backend NO valida contra
    # el diccionario RUNES del frontend (esa lista vive y cambia ahí, ver
    # frontend/src/lib/runes.ts), solo persiste el string tal cual. Permisivo
    # a propósito: validar aquí duplicaría la fuente de verdad del frontend.
    rune: str | None = Field(None, max_length=30)


class MuscleGroupPatchIn(BaseModel):
    # slug YA NO dobla como identificador de runa (item 14: rune de abajo es
    # la columna dedicada). Sigue siendo PATCHable a nivel de API por si hace
    # falta un rename administrativo, pero el frontend deja de exponerlo como
    # editable tras la creación (identidad estable, ver MuscleGroupManager.vue)
    slug: str | None = Field(None, min_length=2, max_length=30, pattern=r"^[a-z0-9-]+$")
    name_es: str | None = Field(None, min_length=1, max_length=50)
    name_en: str | None = Field(None, min_length=1, max_length=50)
    # permisivo igual que en MuscleGroupIn; distinguible de "no lo toques"
    # via payload.model_fields_set (ver update_muscle_group), así un rune
    # explícito a null SÍ limpia la runa dedicada (vuelve a caer al slug)
    rune: str | None = Field(None, max_length=30)


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
