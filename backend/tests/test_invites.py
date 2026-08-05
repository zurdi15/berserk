from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app import models


def redeem(app, token: str, username: str = "loki") -> "TestClient":
    fresh = TestClient(app)
    resp = fresh.post(
        "/api/v1/auth/invites/redeem",
        json={"token": token, "username": username, "password": "secret123"},
    )
    fresh.last_redeem = resp  # type: ignore[attr-defined]
    return fresh


def test_invite_full_flow(client: TestClient, app):
    token = client.post("/api/v1/admin/invites").json()["token"]
    fresh = redeem(app, token)
    assert fresh.last_redeem.status_code == 201
    me = fresh.get("/api/v1/auth/me").json()
    assert me["username"] == "loki"
    assert me["is_admin"] is False


def test_invite_single_use(client: TestClient, app):
    token = client.post("/api/v1/admin/invites").json()["token"]
    assert redeem(app, token).last_redeem.status_code == 201
    resp = redeem(app, token, "hela").last_redeem
    assert resp.status_code == 410
    assert resp.json()["detail"] == "invite_invalid"


def test_invalid_and_expired_invites(client: TestClient, app, db_session):
    assert redeem(app, "bogus-token").last_redeem.status_code == 410
    token = client.post("/api/v1/admin/invites").json()["token"]
    invite = db_session.scalar(select(models.Invite))
    invite.expires_at = models.utcnow() - timedelta(seconds=1)
    db_session.commit()
    assert redeem(app, token).last_redeem.status_code == 410


def test_redeem_duplicate_username_keeps_invite(client: TestClient, app):
    token = client.post("/api/v1/admin/invites").json()["token"]
    resp = redeem(app, token, "admin").last_redeem
    assert resp.status_code == 409
    assert resp.json()["detail"] == "username_taken"
    # la invitación no se quema con un intento fallido
    assert redeem(app, token, "loki").last_redeem.status_code == 201


def test_list_and_delete_invites(client: TestClient):
    client.post("/api/v1/admin/invites")
    invites = client.get("/api/v1/admin/invites").json()
    assert len(invites) == 1
    assert "token" not in invites[0]  # el token en claro solo se enseña al crear
    assert client.delete(f"/api/v1/admin/invites/{invites[0]['id']}").status_code == 204
    assert client.get("/api/v1/admin/invites").json() == []


def test_deleting_admin_cascades_pending_and_nulls_redeemed(client: TestClient, app, db_session):
    from tests.conftest import make_user, login

    other_admin = make_user(client, "odin", is_admin=True)
    odin = login(app, "odin")
    odin.post("/api/v1/admin/invites")                       # pendiente de odin: cae con él
    token = client.post("/api/v1/admin/invites").json()["token"]  # del admin superviviente
    fresh = TestClient(app)
    resp = fresh.post(
        "/api/v1/auth/invites/redeem",
        json={"token": token, "username": "loki", "password": "secret123"},
    )
    assert resp.status_code == 201
    loki_id = resp.json()["id"]

    assert client.delete(f"/api/v1/admin/users/{other_admin['id']}").status_code == 204
    invites = db_session.scalars(select(models.Invite)).all()
    assert len(invites) == 1
    assert invites[0].used_by == loki_id

    assert client.delete(f"/api/v1/admin/users/{loki_id}").status_code == 204
    db_session.expire_all()
    assert db_session.scalar(select(models.Invite)).used_by is None
