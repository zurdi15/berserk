import re
from datetime import datetime
from typing import Literal
from zoneinfo import available_timezones

from pydantic import BaseModel, Field, field_validator

from .auth import Credentials, UserOut, _validate_password_bytes

# se materializa una vez: available_timezones() lee el disco en cada llamada
_TIMEZONES = frozenset(available_timezones())
_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


class SettingsIn(BaseModel):
    locale: Literal["es", "en"] | None = None
    units: Literal["kg", "lb"] | None = None
    timezone: str | None = Field(None, max_length=50)
    # a diferencia de locale/units/timezone, color SÍ es anulable: un null
    # explícito es la forma de volver al aurora del tema (ver users.py)
    color: str | None = None
    # v0.11.0: objetivo de peso corporal (kg canónicos) — anulable: un null
    # explícito retira el objetivo
    goal_weight_kg: float | None = Field(None, gt=0, le=500)

    @field_validator("timezone")
    @classmethod
    def _timezone_is_iana(cls, value: str | None) -> str | None:
        if value is not None and value not in _TIMEZONES:
            raise ValueError("timezone_invalid")
        return value

    @field_validator("color")
    @classmethod
    def _color_is_hex(cls, value: str | None) -> str | None:
        if value is not None and not _COLOR_RE.fullmatch(value):
            raise ValueError("color_invalid")
        return value


class UserCreateIn(Credentials):
    is_admin: bool = False


class UserUpdateIn(BaseModel):
    # item (v0.4.0): el admin ahora también puede editar nombre y color, no
    # solo password/is_admin — mismas reglas de longitud que Credentials.username
    # (registro/bootstrap/redeem), reutilizadas aquí en vez de duplicadas sueltas.
    # No anulable: un null explícito se ignora (siempre hace falta un nombre) —
    # ver update_user, que lo distingue de "campo ausente" vía exclude_unset.
    username: str | None = Field(None, min_length=3, max_length=50)
    password: str | None = Field(None, min_length=8, max_length=100)
    is_admin: bool | None = None
    # anulable a propósito, igual que SettingsIn.color: un null explícito
    # vuelve al aurora del tema por defecto — mismo regex, reutilizado en vez
    # de duplicado (ver _COLOR_RE arriba)
    color: str | None = None

    @field_validator("password")
    @classmethod
    def _password_byte_limit(cls, value: str | None) -> str | None:
        return _validate_password_bytes(value) if value is not None else value

    @field_validator("color")
    @classmethod
    def _color_is_hex(cls, value: str | None) -> str | None:
        if value is not None and not _COLOR_RE.fullmatch(value):
            raise ValueError("color_invalid")
        return value


class InviteTokenOut(BaseModel):
    token: str


class InviteOut(BaseModel):
    id: int
    created_at: datetime
    expires_at: datetime
    used_at: datetime | None

    model_config = {"from_attributes": True}


class RedeemIn(Credentials):
    token: str


class GrantIn(BaseModel):
    username: str


class SharingOut(BaseModel):
    given: list[UserOut]
    received: list[UserOut]


class UserDirectoryOut(BaseModel):
    """item 11: ficha mínima del picker de "conceder acceso" — instancia
    self-hosted pequeña, cualquier usuario autenticado puede ver este listado
    de los demás. A propósito NO reutiliza UserOut: nunca debe filtrar
    is_admin/locale/units/timezone, solo lo que el picker necesita pintar."""

    id: int
    username: str
    color: str | None

    model_config = {"from_attributes": True}
