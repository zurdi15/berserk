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


def test_settings_explicit_null_is_ignored(client: TestClient):
    before = client.get("/api/v1/auth/me").json()["locale"]
    # ninguno de los tres campos de settings es anulable: un null explícito se ignora
    resp = client.patch("/api/v1/users/me", json={"locale": None})
    assert resp.status_code == 200 and resp.json()["locale"] == before


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


# item (v0.4.0): el admin también puede editar nombre y color, no solo
# password/is_admin — mismas reglas que el propio /users/me para color,
# reglas de Credentials.username para el nombre
def test_admin_updates_username(client: TestClient, app):
    created = make_user(client, "freyja")
    resp = client.patch(
        f"/api/v1/admin/users/{created['id']}", json={"username": "freyja2"}
    )
    assert resp.status_code == 200
    assert resp.json()["username"] == "freyja2"

    # el cambio es real: el login con el nombre nuevo funciona
    freyja = login(app, "freyja2")
    assert freyja.get("/api/v1/auth/me").json()["username"] == "freyja2"


def test_admin_username_change_collision(client: TestClient):
    make_user(client, "freyja")
    loki = make_user(client, "loki")
    resp = client.patch(f"/api/v1/admin/users/{loki['id']}", json={"username": "freyja"})
    assert resp.status_code == 409
    assert resp.json()["detail"] == "username_taken"


def test_admin_username_unchanged_is_a_noop_not_a_self_collision(client: TestClient):
    # renombrar a SU PROPIO nombre actual no debe chocar contra sí mismo
    created = make_user(client, "freyja")
    resp = client.patch(
        f"/api/v1/admin/users/{created['id']}", json={"username": "freyja"}
    )
    assert resp.status_code == 200
    assert resp.json()["username"] == "freyja"


def test_admin_username_explicit_null_is_ignored(client: TestClient):
    created = make_user(client, "freyja")
    resp = client.patch(f"/api/v1/admin/users/{created['id']}", json={"username": None})
    assert resp.status_code == 200
    assert resp.json()["username"] == "freyja"


def test_admin_rejects_short_username(client: TestClient):
    created = make_user(client, "freyja")
    resp = client.patch(f"/api/v1/admin/users/{created['id']}", json={"username": "fr"})
    assert resp.status_code == 422


def test_admin_updates_color(client: TestClient):
    created = make_user(client, "freyja")
    resp = client.patch(
        f"/api/v1/admin/users/{created['id']}", json={"color": "#7C8FFF"}
    )
    assert resp.status_code == 200
    assert resp.json()["color"] == "#7C8FFF"


def test_admin_rejects_invalid_color(client: TestClient):
    created = make_user(client, "freyja")
    resp = client.patch(f"/api/v1/admin/users/{created['id']}", json={"color": "blue"})
    assert resp.status_code == 422


def test_admin_color_explicit_null_clears_it(client: TestClient):
    created = make_user(client, "freyja")
    client.patch(f"/api/v1/admin/users/{created['id']}", json={"color": "#7C8FFF"})
    resp = client.patch(f"/api/v1/admin/users/{created['id']}", json={"color": None})
    assert resp.status_code == 200
    assert resp.json()["color"] is None


def test_admin_can_edit_username_and_color_in_the_same_request_as_password(client: TestClient):
    # las tres cosas conviven en el mismo payload sin pisarse entre sí
    created = make_user(client, "freyja")
    resp = client.patch(
        f"/api/v1/admin/users/{created['id']}",
        json={"username": "freyja2", "color": "#7C8FFF", "password": "brandnew1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == "freyja2"
    assert body["color"] == "#7C8FFF"


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


def test_settings_reject_unknown_timezone(client: TestClient):
    resp = client.patch("/api/v1/users/me", json={"timezone": "Mars/Olympus"})
    assert resp.status_code == 422


def test_settings_accept_iana_timezone(client: TestClient):
    resp = client.patch("/api/v1/users/me", json={"timezone": "America/Bogota"})
    assert resp.status_code == 200
    assert resp.json()["timezone"] == "America/Bogota"


def test_new_user_color_defaults_to_none(client: TestClient):
    assert client.get("/api/v1/auth/me").json()["color"] is None


def test_update_own_color(client: TestClient):
    resp = client.patch("/api/v1/users/me", json={"color": "#7C8FFF"})
    assert resp.status_code == 200
    assert resp.json()["color"] == "#7C8FFF"
    assert client.get("/api/v1/auth/me").json()["color"] == "#7C8FFF"


def test_settings_reject_invalid_color_word(client: TestClient):
    resp = client.patch("/api/v1/users/me", json={"color": "blue"})
    assert resp.status_code == 422


def test_settings_reject_short_hex_color(client: TestClient):
    resp = client.patch("/api/v1/users/me", json={"color": "#fff"})
    assert resp.status_code == 422


def test_settings_reject_hex_without_hash(client: TestClient):
    resp = client.patch("/api/v1/users/me", json={"color": "7C8FFF"})
    assert resp.status_code == 422


# v0.27.0: renombrarse a uno mismo desde la sección Cuenta (antes solo el
# admin podía renombrar, y a OTRA cuenta)
def test_update_own_username(client: TestClient, app):
    resp = client.patch("/api/v1/users/me", json={"username": "berserker"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "berserker"

    # el cambio es real: el login con el nombre nuevo funciona, con la misma
    # contraseña (renombrar no toca la sesión ni el hash)
    renamed = login(app, "berserker", "admin1234")
    assert renamed.get("/api/v1/auth/me").json()["username"] == "berserker"


def test_update_own_username_rejects_taken_name(client: TestClient):
    make_user(client, "freyja")
    resp = client.patch("/api/v1/users/me", json={"username": "freyja"})
    assert resp.status_code == 409
    assert resp.json()["detail"] == "username_taken"


def test_update_own_username_accepts_own_current_name(client: TestClient):
    # guardar el formulario sin tocar el nombre no debe verse como colisión
    # consigo mismo (el unique se compara contra OTRAS filas, no la propia)
    resp = client.patch("/api/v1/users/me", json={"username": "admin"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "admin"


def test_update_own_username_rejects_too_short(client: TestClient):
    assert client.patch("/api/v1/users/me", json={"username": "ab"}).status_code == 422


def test_update_own_username_explicit_null_is_ignored(client: TestClient):
    resp = client.patch("/api/v1/users/me", json={"username": None})
    assert resp.status_code == 200 and resp.json()["username"] == "admin"


def test_directory_requires_auth(anon: TestClient):
    # item 11: autenticado sí, admin-only NO — pero sigue exigiendo sesión
    assert anon.get("/api/v1/users/directory").status_code == 401


def test_directory_excludes_self_and_lists_others(client: TestClient, app):
    # el picker de "conceder acceso" es de una instancia self-hosted
    # pequeña: cualquier usuario ve a los demás, nunca a sí mismo
    make_user(client, "freyja")
    make_user(client, "loki")
    me = client.get("/api/v1/auth/me").json()

    directory = client.get("/api/v1/users/directory").json()
    usernames = {u["username"] for u in directory}
    assert usernames == {"freyja", "loki"}
    assert all(u["id"] != me["id"] for u in directory)

    freyja = login(app, "freyja")
    freyja_directory = freyja.get("/api/v1/users/directory").json()
    assert {u["username"] for u in freyja_directory} == {me["username"], "loki"}


def test_directory_only_exposes_minimal_fields(client: TestClient):
    # nunca debe filtrar is_admin/locale/units/timezone — solo lo que el
    # picker necesita pintar (ver schemas.users.UserDirectoryOut)
    make_user(client, "freyja")
    entry = client.get("/api/v1/users/directory").json()[0]
    assert set(entry.keys()) == {"id", "username", "color"}


def test_settings_color_explicit_null_clears_it(client: TestClient):
    # a diferencia de locale/units/timezone, color sí acepta null explícito:
    # es la forma de volver al aurora del tema por defecto
    client.patch("/api/v1/users/me", json={"color": "#7C8FFF"})
    resp = client.patch("/api/v1/users/me", json={"color": None})
    assert resp.status_code == 200
    assert resp.json()["color"] is None
