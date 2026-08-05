from fastapi.testclient import TestClient

from tests.conftest import login, make_user


def test_update_own_settings(client: TestClient):
    resp = client.patch(
        "/api/v1/users/me", json={"locale": "en", "units": "lb", "timezone": "UTC"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert (body["locale"], body["units"], body["timezone"]) == ("en", "lb", "UTC")


def test_settings_reject_unknown_locale(client: TestClient):
    assert client.patch("/api/v1/users/me", json={"locale": "fr"}).status_code == 422


def test_admin_creates_user_who_can_login(client: TestClient, app):
    created = make_user(client, "freyja")
    assert created["is_admin"] is False
    freyja = login(app, "freyja")
    assert freyja.get("/api/v1/auth/me").json()["username"] == "freyja"


def test_admin_endpoints_forbidden_for_non_admin(client: TestClient, app):
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert freyja.get("/api/v1/admin/users").status_code == 403


def test_duplicate_username_conflict(client: TestClient):
    make_user(client, "freyja")
    resp = client.post(
        "/api/v1/admin/users",
        json={"username": "freyja", "password": "secret123", "is_admin": False},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "username_taken"


def test_admin_password_reset_revokes_sessions(client: TestClient, app):
    created = make_user(client, "freyja")
    freyja = login(app, "freyja")
    resp = client.patch(
        f"/api/v1/admin/users/{created['id']}", json={"password": "brandnew1"}
    )
    assert resp.status_code == 200
    assert freyja.get("/api/v1/auth/me").status_code == 401
    assert login(app, "freyja", "brandnew1").get("/api/v1/auth/me").status_code == 200


def test_admin_cannot_delete_self(client: TestClient):
    me = client.get("/api/v1/auth/me").json()
    resp = client.delete(f"/api/v1/admin/users/{me['id']}")
    assert resp.status_code == 409
    assert resp.json()["detail"] == "cannot_delete_self"


def test_admin_cannot_demote_self(client: TestClient):
    me = client.get("/api/v1/auth/me").json()
    resp = client.patch(f"/api/v1/admin/users/{me['id']}", json={"is_admin": False})
    assert resp.status_code == 409
    assert resp.json()["detail"] == "cannot_demote_self"


def test_delete_user(client: TestClient, app):
    created = make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert client.delete(f"/api/v1/admin/users/{created['id']}").status_code == 204
    assert freyja.get("/api/v1/auth/me").status_code == 401
    assert client.delete("/api/v1/admin/users/9999").status_code == 404
