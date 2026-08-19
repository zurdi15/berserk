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
    # v0.19.x (zurdi): el nombre EN es OPCIONAL — '' = sin traducción, y el
    # cliente cae al name_es cuando la app está en inglés (ver
    # frontend exerciseName). Columna no-nullable: se guarda '' tal cual,
    # sin migración.
    name_en: str = Field("", max_length=80)
    measurement: Literal["strength", "bodyweight", "timed", "cardio"]
    muscle_groups: list[ExerciseMuscleLink] = Field(min_length=1)
    # item 3: ejercicio global (owner_id null, visible a todo el mundo) —
    # solo un admin puede pedirlo, igual que MuscleGroupIn.is_global
    is_global: bool = False
    # W2 feature 1: "check de globales" de un ejercicio PROPIO — a diferencia
    # de is_global (catálogo admin, owner_id NULL) esto no requiere admin: el
    # dueño se queda dueño/editor, solo se amplía quién lo VE y usa (ver
    # list_exercises y get_visible_exercise)
    is_public: bool = False

    @field_validator("muscle_groups")
    @classmethod
    def _one_primary(cls, v):
        return _exactly_one_primary(v)


class ExercisePatchIn(BaseModel):
    name_es: str | None = Field(None, min_length=1, max_length=80)
    # sin min_length: '' explícito BORRA la traducción EN (None = no tocar)
    name_en: str | None = Field(None, max_length=80)
    muscle_groups: list[ExerciseMuscleLink] | None = Field(None, min_length=1)
    # anulable a nivel de tipo por consistencia, pero None = "no lo toques"
    # (ver update_exercise: solo se aplica si no es None), nunca "vuelve a
    # privado" — para eso hay que mandar is_public=False explícito
    is_public: bool | None = None

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
    is_public: bool
    # W2 feature 1: atribución para la sección "catálogo-ish" del frontend
    # (hint "— username" en las públicas de otros) — None para el catálogo
    # admin (owner_id NULL); siempre poblado si hay owner_id, el frontend
    # decide si mostrarlo (no lo hace para las propias filas del usuario)
    owner_username: str | None
    # v0.12.0: True si el ejercicio tiene imagen — el fichero real se sirve
    # por GET /exercises/{id}/image, el cliente solo necesita saber si pedirla
    has_image: bool = False
    muscle_groups: list[ExerciseMuscleLink]
