from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PushConfigOut(BaseModel):
    enabled: bool
    # clave pública VAPID en base64url, lista para applicationServerKey
    public_key: str | None


class PushKeysIn(BaseModel):
    p256dh: str = Field(min_length=1, max_length=255)
    auth: str = Field(min_length=1, max_length=64)


class PushSubscriptionIn(BaseModel):
    # lo que devuelve PushSubscription.toJSON() en el navegador, tal cual
    endpoint: str = Field(min_length=1, max_length=1024)
    keys: PushKeysIn
    user_agent: str | None = Field(None, max_length=255)


class PushUnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=1024)


class PushTimerIn(BaseModel):
    kind: Literal["rest", "cardio"]
    # instante absoluto de fin (con zona horaria; el frontend manda ISO UTC)
    fire_at: datetime
    title: str = Field(min_length=1, max_length=120)
    body: str = Field("", max_length=200)


class PushTestOut(BaseModel):
    delivered: int
