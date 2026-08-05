from fastapi.testclient import TestClient

from tests.conftest import ADMIN


def test_health(anon: TestClient):
    resp = anon.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_status_flips_after_bootstrap(app):
    with TestClient(app) as fresh:
        assert fresh.get("/api/v1/auth/status").json() == {"bootstrapped": False}
        resp = fresh.post("/api/v1/auth/bootstrap", json=ADMIN)
        assert resp.status_code == 201
        body = resp.json()
        assert body["username"] == ADMIN["username"]
        assert body["is_admin"] is True
        assert "password" not in body and "password_hash" not in body
        assert fresh.get("/api/v1/auth/status").json() == {"bootstrapped": True}


def test_bootstrap_sets_session_cookie(app):
    with TestClient(app) as fresh:
        fresh.post("/api/v1/auth/bootstrap", json=ADMIN)
        assert fresh.get("/api/v1/auth/me").status_code == 200


def test_bootstrap_conflicts_when_users_exist(client: TestClient):
    resp = client.post(
        "/api/v1/auth/bootstrap", json={"username": "odin", "password": "password1"}
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "already_bootstrapped"
