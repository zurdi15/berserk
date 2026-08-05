from fastapi.testclient import TestClient

from tests.conftest import ADMIN


def test_login_ok(client: TestClient, app):
    with TestClient(app) as fresh:
        resp = fresh.post("/api/v1/auth/login", json=ADMIN)
        assert resp.status_code == 200
        assert resp.json()["username"] == ADMIN["username"]
        assert fresh.get("/api/v1/auth/me").status_code == 200


def test_login_wrong_password(client: TestClient, app):
    with TestClient(app) as fresh:
        resp = fresh.post(
            "/api/v1/auth/login",
            json={"username": ADMIN["username"], "password": "nope-nope"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "invalid_credentials"


def test_login_unknown_user_same_error(client: TestClient, app):
    with TestClient(app) as fresh:
        resp = fresh.post(
            "/api/v1/auth/login", json={"username": "ghost", "password": "whatever1"}
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "invalid_credentials"


def test_me_requires_session(anon: TestClient):
    assert anon.get("/api/v1/auth/me").status_code == 401


def test_logout_revokes_session(client: TestClient):
    assert client.get("/api/v1/auth/me").status_code == 200
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_password_change(client: TestClient, app):
    resp = client.post(
        "/api/v1/auth/password",
        json={"current_password": ADMIN["password"], "new_password": "newpass123"},
    )
    assert resp.status_code == 204
    # la sesión actual sigue viva y la nueva contraseña funciona en un client nuevo
    assert client.get("/api/v1/auth/me").status_code == 200
    with TestClient(app) as fresh:
        assert (
            fresh.post(
                "/api/v1/auth/login",
                json={"username": ADMIN["username"], "password": "newpass123"},
            ).status_code
            == 200
        )
        assert (
            fresh.post("/api/v1/auth/login", json=ADMIN).status_code == 401
        )


def test_password_change_wrong_current(client: TestClient):
    resp = client.post(
        "/api/v1/auth/password",
        json={"current_password": "wrong-one", "new_password": "newpass123"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "wrong_password"


def test_password_change_revokes_other_sessions(client: TestClient, app):
    other = TestClient(app)
    other.post("/api/v1/auth/login", json=ADMIN)
    assert other.get("/api/v1/auth/me").status_code == 200
    client.post(
        "/api/v1/auth/password",
        json={"current_password": ADMIN["password"], "new_password": "newpass123"},
    )
    assert other.get("/api/v1/auth/me").status_code == 401
