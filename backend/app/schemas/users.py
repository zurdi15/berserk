from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .auth import Credentials, _validate_password_bytes


class SettingsIn(BaseModel):
    locale: Literal["es", "en"] | None = None
    units: Literal["kg", "lb"] | None = None
    timezone: str | None = Field(None, max_length=50)


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
