from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .auth import Credentials


class SettingsIn(BaseModel):
    locale: Literal["es", "en"] | None = None
    units: Literal["kg", "lb"] | None = None
    timezone: str | None = Field(None, max_length=50)


class UserCreateIn(Credentials):
    is_admin: bool = False


class UserUpdateIn(BaseModel):
    password: str | None = Field(None, min_length=8, max_length=100)
    is_admin: bool | None = None


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
