from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import PushSubscription, PushTimer, utcnow
from ..schemas.push import (
    PushConfigOut,
    PushSubscriptionIn,
    PushTestOut,
    PushTimerIn,
    PushUnsubscribeIn,
)
from ..services.push import PushScheduler, VapidKeys, send_to_user

router = APIRouter(prefix="/push", tags=["push"])

# client_id lo elige el cliente (dispositivo + tipo de timer): así cancelar o
# reprogramar es un PUT/DELETE idempotente sin tener que recordar ids del
# servidor — igual que el id fijo de las notificaciones de la shell
CLIENT_ID_MAX = 64


def _keys(request: Request) -> VapidKeys:
    keys: VapidKeys | None = getattr(request.app.state, "push_keys", None)
    if keys is None:
        raise HTTPException(status_code=503, detail="push_disabled")
    return keys


def _scheduler(request: Request) -> PushScheduler | None:
    return getattr(request.app.state, "push_scheduler", None)


@router.get("/config", response_model=PushConfigOut)
def push_config(request: Request):
    keys: VapidKeys | None = getattr(request.app.state, "push_keys", None)
    return PushConfigOut(enabled=keys is not None, public_key=keys.public_key if keys else None)


@router.put("/subscriptions", status_code=204)
def upsert_subscription(
    payload: PushSubscriptionIn, request: Request, user: CurrentUser, db: Session = Depends(get_db)
):
    _keys(request)
    sub = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if sub is None:
        sub = PushSubscription(user_id=user.id, endpoint=payload.endpoint)
        db.add(sub)
    # el mismo navegador puede cambiar de cuenta: el endpoint sigue al último
    # usuario que lo registró, nunca avisa a dos
    sub.user_id = user.id
    sub.p256dh = payload.keys.p256dh
    sub.auth = payload.keys.auth
    sub.user_agent = payload.user_agent
    sub.last_seen_at = utcnow()
    db.commit()
    return Response(status_code=204)


@router.post("/subscriptions/unsubscribe", status_code=204)
def unsubscribe(payload: PushUnsubscribeIn, user: CurrentUser, db: Session = Depends(get_db)):
    db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint, PushSubscription.user_id == user.id
        )
    )
    db.commit()
    return Response(status_code=204)


@router.put("/timers/{client_id}", status_code=204)
def schedule_timer(
    client_id: str,
    payload: PushTimerIn,
    request: Request,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    _keys(request)
    if len(client_id) > CLIENT_ID_MAX:
        raise HTTPException(status_code=422, detail="client_id_too_long")
    fire_at = payload.fire_at
    # naive UTC como el resto de fechas de la app (ver models.utcnow)
    if fire_at.tzinfo is not None:
        fire_at = fire_at.astimezone(UTC).replace(tzinfo=None)
    timer = db.scalar(select(PushTimer).where(PushTimer.client_id == client_id))
    if timer is None:
        timer = PushTimer(client_id=client_id)
        db.add(timer)
    elif timer.user_id != user.id:
        # un client_id ajeno no se pisa: lo forma el dispositivo con un uuid,
        # si colisiona es otro usuario intentando cancelar avisos que no son suyos
        raise HTTPException(status_code=409, detail="client_id_taken")
    timer.user_id = user.id
    timer.kind = payload.kind
    timer.fire_at = fire_at
    timer.title = payload.title
    timer.body = payload.body
    db.commit()
    scheduler = _scheduler(request)
    if scheduler:
        scheduler.notify()
    return Response(status_code=204)


@router.delete("/timers/{client_id}", status_code=204)
def cancel_timer(client_id: str, request: Request, user: CurrentUser, db: Session = Depends(get_db)):
    db.execute(delete(PushTimer).where(PushTimer.client_id == client_id, PushTimer.user_id == user.id))
    db.commit()
    scheduler = _scheduler(request)
    if scheduler:
        scheduler.notify()
    return Response(status_code=204)


@router.post("/test", response_model=PushTestOut)
def send_test(request: Request, user: CurrentUser, db: Session = Depends(get_db)):
    """Un push inmediato a todos los dispositivos del usuario: la forma de
    comprobar desde Ajustes que el iPhone de verdad recibe avisos."""
    keys = _keys(request)
    delivered = send_to_user(
        db,
        keys,
        user.id,
        {"kind": "test", "title": "berserk", "body": "✓", "tag": "berserk-test", "url": "/"},
    )
    return PushTestOut(delivered=delivered)
