"""v0.17.0 — act-as (zurdi: "que los admin puedan editar las rutinas,
ejercicios, etc. de cualquier usuario, como si estuviesen logados como ese
usuario"): el header X-Bk-Act-As se resuelve en get_current_user, así que
TODO el backend (lecturas y mutaciones) actúa como el usuario objetivo sin
tocar endpoints. Solo admins; objetivo inexistente = 404."""

from fastapi.testclient import TestClient

from tests.conftest import login, make_user


def test_admin_acts_as_target_for_reads_and_writes(client: TestClient):
    target = make_user(client, "loki")
    headers = {"X-Bk-Act-As": str(target["id"])}

    # /auth/me devuelve el suplantado — "como si estuviese logado como él"
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["username"] == "loki"

    # una rutina creada actuando pertenece al OBJETIVO, no al admin
    routine = client.post(
        "/api/v1/routines", json={"name": "Pierna de loki"}, headers=headers
    ).json()
    assert routine["owner_id"] == target["id"]

    # y el objetivo la ve como suya al listar con su propia sesión
    # (contraseña por defecto de make_user)
    target_client = login(client.app, "loki")
    names = [r["name"] for r in target_client.get("/api/v1/routines").json()]
    assert "Pierna de loki" in names

    # sin el header, el admin sigue siendo él mismo
    assert client.get("/api/v1/auth/me").json()["username"] != "loki"


def test_non_admin_gets_403_for_act_as_header(client: TestClient):
    make_user(client, "loki")
    plain = make_user(client, "hodr")
    plain_client = login(client.app, "hodr")
    resp = plain_client.get("/api/v1/auth/me", headers={"X-Bk-Act-As": "1"})
    assert resp.status_code == 403 and resp.json()["detail"] == "admin_only"
    # sin depender del id concreto: cualquier valor dispara el 403 antes de
    # resolver el objetivo
    assert plain is not None


def test_unknown_or_malformed_target_is_404(client: TestClient):
    resp = client.get("/api/v1/auth/me", headers={"X-Bk-Act-As": "99999"})
    assert resp.status_code == 404
    resp = client.get("/api/v1/auth/me", headers={"X-Bk-Act-As": "banana"})
    assert resp.status_code == 404


def test_acting_as_non_admin_loses_admin_endpoints(client: TestClient):
    target = make_user(client, "loki")
    resp = client.get(
        "/api/v1/admin/users", headers={"X-Bk-Act-As": str(target["id"])}
    )
    # "como si estuviese logado como ese usuario" incluye NO ser admin
    assert resp.status_code == 403
