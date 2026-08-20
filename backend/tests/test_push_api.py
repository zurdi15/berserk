"""v0.36.0 Web Push: suscripciones, avisos programados y el scheduler.
El envío real (pywebpush) se sustituye por un doble: aquí se prueba la
contabilidad (quién, cuándo, purga de endpoints muertos), no la red."""
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.models import PushSubscription, PushTimer
from app.services import push as push_service
from tests.conftest import login, make_user

SUB = {
    "endpoint": "https://push.example/abc",
    "keys": {"p256dh": "BPub", "auth": "auth"},
    "user_agent": "iPhone Safari",
}


def test_config_exposes_public_key(client: TestClient):
    cfg = client.get("/api/v1/push/config").json()
    assert cfg["enabled"] is True
    # base64url sin padding de un punto X9.62 sin comprimir (65 bytes)
    assert cfg["public_key"] and "=" not in cfg["public_key"] and len(cfg["public_key"]) == 87


def test_subscription_upsert_follows_last_user(client: TestClient, app, db_session):
    assert client.put("/api/v1/push/subscriptions", json=SUB).status_code == 204
    assert client.put("/api/v1/push/subscriptions", json={**SUB, "keys": {"p256dh": "BNew", "auth": "a2"}}).status_code == 204
    subs = db_session.query(PushSubscription).all()
    assert len(subs) == 1 and subs[0].p256dh == "BNew"

    # el mismo navegador entra con otra cuenta: el endpoint cambia de dueño
    ana_id = make_user(client, "ana")["id"]
    ana = login(app, "ana")
    assert ana.put("/api/v1/push/subscriptions", json=SUB).status_code == 204
    db_session.expire_all()
    subs = db_session.query(PushSubscription).all()
    assert len(subs) == 1 and subs[0].user_id == ana_id

    # darse de baja solo borra lo propio
    assert client.post("/api/v1/push/subscriptions/unsubscribe", json={"endpoint": SUB["endpoint"]}).status_code == 204
    db_session.expire_all()
    assert db_session.query(PushSubscription).count() == 1
    assert ana.post("/api/v1/push/subscriptions/unsubscribe", json={"endpoint": SUB["endpoint"]}).status_code == 204
    db_session.expire_all()
    assert db_session.query(PushSubscription).count() == 0


def test_timer_put_is_idempotent_and_cancel_deletes(client: TestClient, app, db_session):
    fire_at = (datetime.now(UTC) + timedelta(seconds=90)).isoformat()
    body = {"kind": "rest", "fire_at": fire_at, "title": "Descanso terminado", "body": "Press banca"}
    assert client.put("/api/v1/push/timers/dev1-rest", json=body).status_code == 204
    assert client.put("/api/v1/push/timers/dev1-rest", json={**body, "body": "Sentadilla"}).status_code == 204
    timers = db_session.query(PushTimer).all()
    assert len(timers) == 1 and timers[0].body == "Sentadilla"
    # se guarda en UTC naive, como el resto de fechas
    assert timers[0].fire_at.tzinfo is None

    # otro usuario no puede pisar ni cancelar un client_id ajeno
    make_user(client, "ana")
    ana = login(app, "ana")
    assert ana.put("/api/v1/push/timers/dev1-rest", json=body).status_code == 409
    assert ana.delete("/api/v1/push/timers/dev1-rest").status_code == 204
    db_session.expire_all()
    assert db_session.query(PushTimer).count() == 1

    assert client.delete("/api/v1/push/timers/dev1-rest").status_code == 204
    assert client.delete("/api/v1/push/timers/dev1-rest").status_code == 204
    db_session.expire_all()
    assert db_session.query(PushTimer).count() == 0


def test_scheduler_fires_due_and_purges_dead_subscriptions(client: TestClient, app, db_session, monkeypatch):
    sent: list[tuple[str, dict]] = []

    def fake_send(keys, sub, payload):
        sent.append((sub.endpoint, payload))
        return not sub.endpoint.endswith("/dead")

    monkeypatch.setattr(push_service, "send_to_subscription", fake_send)
    client.put("/api/v1/push/subscriptions", json=SUB)
    client.put("/api/v1/push/subscriptions", json={**SUB, "endpoint": "https://push.example/dead"})

    now = datetime.now(UTC)
    client.put("/api/v1/push/timers/d-rest", json={"kind": "rest", "fire_at": (now - timedelta(seconds=2)).isoformat(), "title": "Descanso terminado"})
    client.put("/api/v1/push/timers/d-cardio", json={"kind": "cardio", "fire_at": (now + timedelta(minutes=5)).isoformat(), "title": "Cardio terminado"})
    # vencido hace demasiado: se descarta sin avisar
    client.put("/api/v1/push/timers/d-old", json={"kind": "rest", "fire_at": (now - timedelta(hours=1)).isoformat(), "title": "viejo"})

    scheduler: push_service.PushScheduler = app.state.push_scheduler
    assert scheduler.fire_due() == 1
    endpoints = sorted(e for e, _ in sent)
    assert endpoints == ["https://push.example/abc", "https://push.example/dead"]
    assert sent[0][1]["tag"] == "berserk-rest-timer" and sent[0][1]["url"] == "/workout"

    db_session.expire_all()
    # el del futuro sigue; el vencido y el viejo se han ido; la suscripción muerta también
    assert [t.client_id for t in db_session.query(PushTimer).all()] == ["d-cardio"]
    assert [s.endpoint for s in db_session.query(PushSubscription).all()] == [SUB["endpoint"]]

    # el test manual desde Ajustes cuenta entregas
    sent.clear()
    assert client.post("/api/v1/push/test").json() == {"delivered": 1}


def test_push_requires_session(anon: TestClient):
    assert anon.get("/api/v1/push/config").status_code == 401
