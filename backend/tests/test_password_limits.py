"""bcrypt 5.x lanza ValueError con passwords >72 bytes; sin tope en el schema
eso llega intacto hasta bcrypt y se convierte en un 500 en vez de un 422."""

from fastapi.testclient import TestClient

from tests.conftest import ADMIN


def test_bootstrap_rejects_long_ascii_password(app):
    with TestClient(app) as fresh:
        resp = fresh.post(
            "/api/v1/auth/bootstrap",
            json={"username": "odin", "password": "x" * 80},
        )
        assert resp.status_code == 422


def test_bootstrap_rejects_long_multibyte_password(app):
    # 20 emojis de 4 bytes cada uno = 80 bytes, pero solo 20 chars (bajo el
    # tope de 100 chars del schema): reproduce el caso que el max_length no cubre
    with TestClient(app) as fresh:
        resp = fresh.post(
            "/api/v1/auth/bootstrap",
            json={"username": "odin", "password": "\U0001f4aa" * 20},
        )
        assert resp.status_code == 422


def test_password_change_rejects_long_password(client: TestClient):
    resp = client.post(
        "/api/v1/auth/password",
        json={"current_password": ADMIN["password"], "new_password": "x" * 80},
    )
    assert resp.status_code == 422
