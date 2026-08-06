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
    password: str | None = Field(None, min_length=8, max_length=100)
    is_admin: bool | None = None

    @field_validator("password")
    @classmethod
    def _password_byte_limit(cls, value: str | None) -> str | None:
        return _validate_password_bytes(value) if value is not None else value


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
