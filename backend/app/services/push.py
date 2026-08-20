"""Web Push (v0.36.0).

zurdi: "mi novia tiene iPhone y usa la app. no tiene apple watch... no
puedo pagar por la app de ios". Sin cuenta de desarrollador no hay app
nativa ni APNs directo, pero Safari 16.4+ entrega Web Push a una PWA
instalada en la pantalla de inicio — y un push lo entrega el sistema
aunque la PWA esté cerrada, que es lo que el setTimeout de la web nunca
pudo garantizar. El backend guarda las suscripciones de cada usuario y
los "avisos programados" (fin de descanso / cardio) y un hilo daemon los
dispara a su hora; el frontend solo programa y cancela.

Por qué en la base de datos y no en memoria: el pod se reinicia en cada
deploy y un descanso de 3 min no debe perderse por eso. Al arrancar, el
hilo dispara lo que venciera mientras no estaba (hasta STALE_AFTER: un
aviso de hace media hora ya solo sería ruido).
"""
from __future__ import annotations

import base64
import json
import logging
import threading
from datetime import datetime, timedelta
from pathlib import Path

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid02
from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from ..models import PushSubscription, PushTimer, utcnow

log = logging.getLogger("berserk.push")

# vencidos hace más de esto al arrancar: se descartan sin avisar
STALE_AFTER = timedelta(minutes=10)
# el hilo se despierta como mucho cada tanto aunque nadie lo avise (red de
# seguridad frente a un notify() perdido)
MAX_SLEEP_S = 60.0
# un push de fin de descanso que el servicio no pueda entregar en este
# margen ya no sirve: mejor que lo tire que que llegue tarde
PUSH_TTL_S = 120


class VapidKeys:
    def __init__(self, private_key_path: Path, subject: str):
        self.private_key_path = private_key_path
        self.subject = subject
        if private_key_path.exists():
            vapid = Vapid02.from_file(str(private_key_path))
        else:
            vapid = Vapid02()
            vapid.generate_keys()
            private_key_path.parent.mkdir(parents=True, exist_ok=True)
            vapid.save_key(str(private_key_path))
            private_key_path.chmod(0o600)
        raw = vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        # el formato que PushManager.subscribe espera en applicationServerKey
        self.public_key = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def send_to_subscription(keys: VapidKeys, sub: PushSubscription, payload: dict) -> bool:
    """Entrega un push; False si la suscripción está muerta (404/410) y hay
    que borrarla. Otros fallos se registran y se tragan: un aviso que no
    llega no debe tumbar el hilo ni la petición."""
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=str(keys.private_key_path),
            vapid_claims={"sub": keys.subject},
            ttl=PUSH_TTL_S,
            timeout=10,
        )
        return True
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            log.info("suscripción push caducada (%s), se borra", status)
            return False
        log.warning("push fallido (%s): %s", status, exc)
        return True
    except Exception as exc:  # noqa: BLE001 — red, DNS, TLS: nunca romper por un aviso
        log.warning("push fallido: %s", exc)
        return True


def send_to_user(db: Session, keys: VapidKeys, user_id: int, payload: dict) -> int:
    """Manda el payload a TODAS las suscripciones del usuario (móvil + tablet,
    p.ej.), purgando las muertas. Devuelve cuántas aceptaron el envío."""
    subs = list(db.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id)))
    delivered = 0
    for sub in subs:
        if send_to_subscription(keys, sub, payload):
            delivered += 1
        else:
            db.delete(sub)
    db.commit()
    return delivered


def timer_payload(timer: PushTimer) -> dict:
    return {
        "kind": timer.kind,
        "title": timer.title,
        "body": timer.body,
        # una notificación por tipo: la de cardio no pisa la de descanso, pero
        # dos descansos seguidos sí se reemplazan (misma tag)
        "tag": f"berserk-{timer.kind}-timer",
        "url": "/workout",
    }


class PushScheduler:
    """Hilo daemon que dispara los PushTimer a su hora. notify() lo despierta
    cuando se programa o cancela algo, para no esperar al siguiente sondeo."""

    def __init__(self, maker: sessionmaker[Session], keys: VapidKeys):
        self._maker = maker
        self._keys = keys
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="bk-push", daemon=True)

    def start(self) -> None:
        if not self._thread.is_alive():
            self._thread.start()

    def stop(self) -> None:
        """Para el hilo y ESPERA a que salga: si sigue tocando la BD mientras
        el engine se cierra (tests con SQLite en memoria, apagado del pod) el
        proceso puede caerse con un fatal error en vez de salir limpio."""
        self._stop.set()
        self._wake.set()
        if self._thread.is_alive():
            self._thread.join(timeout=15)

    def notify(self) -> None:
        self._wake.set()

    def fire_due(self, now: datetime | None = None) -> int:
        """Dispara (y borra) todo lo vencido. Público para los tests y para
        poder forzarlo sin esperar al hilo. Devuelve cuántos avisos salieron."""
        now = now or utcnow()
        fired = 0
        with self._maker() as db:
            due = list(
                db.scalars(
                    select(PushTimer).where(PushTimer.fire_at <= now).order_by(PushTimer.fire_at)
                )
            )
            for timer in due:
                if now - timer.fire_at <= STALE_AFTER:
                    send_to_user(db, self._keys, timer.user_id, timer_payload(timer))
                    fired += 1
                db.delete(timer)
            db.commit()
        return fired

    def _seconds_until_next(self) -> float:
        with self._maker() as db:
            nxt = db.scalar(select(PushTimer.fire_at).order_by(PushTimer.fire_at).limit(1))
        if nxt is None:
            return MAX_SLEEP_S
        return max(0.0, min(MAX_SLEEP_S, (nxt - utcnow()).total_seconds()))

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.fire_due()
                delay = self._seconds_until_next()
            except Exception as exc:  # noqa: BLE001 — la BD puede estar en restore; reintentar luego
                log.warning("scheduler push: %s", exc)
                delay = 5.0
            self._wake.wait(timeout=delay)
            self._wake.clear()
