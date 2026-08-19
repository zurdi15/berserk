"""v0.12.0 — imagen de ejercicio, notas por usuario y fotos de cuerpo."""

from fastapi.testclient import TestClient

from tests.conftest import login, make_user

# PNG 1x1 válido (cabecera real): suficiente para el cap de tipo/tamaño —
# el backend no re-procesa la imagen, solo la guarda
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082"
)


def _bench(client: TestClient) -> int:
    return next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )


def test_exercise_image_roundtrip_and_visibility(client: TestClient, app):
    bench = _bench(client)

    resp = client.post(
        f"/api/v1/exercises/{bench}/image",
        files={"file": ("photo.png", PNG, "image/png")},
    )
    assert resp.status_code == 204, resp.text

    listed = next(e for e in client.get("/api/v1/exercises").json() if e["id"] == bench)
    assert listed["has_image"] is True

    got = client.get(f"/api/v1/exercises/{bench}/image")
    assert got.status_code == 200
    assert got.content == PNG

    # el catálogo global es visible para cualquier usuario: su imagen también
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert freyja.get(f"/api/v1/exercises/{bench}/image").status_code == 200
    # ...pero freyja no puede editarla (no es admin ni dueña)
    assert (
        freyja.post(
            f"/api/v1/exercises/{bench}/image",
            files={"file": ("photo.png", PNG, "image/png")},
        ).status_code
        == 404
    )

    assert client.delete(f"/api/v1/exercises/{bench}/image").status_code == 204
    assert client.get(f"/api/v1/exercises/{bench}/image").status_code == 404
    listed = next(e for e in client.get("/api/v1/exercises").json() if e["id"] == bench)
    assert listed["has_image"] is False


def test_exercise_image_rejects_bad_type(client: TestClient):
    bench = _bench(client)
    resp = client.post(
        f"/api/v1/exercises/{bench}/image",
        files={"file": ("nefasto.txt", b"hola", "text/plain")},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"] == "unsupported_image_type"


def test_exercise_note_upsert_and_clear(client: TestClient, app):
    bench = _bench(client)

    assert client.get(f"/api/v1/exercises/{bench}/note").json() == {"note": ""}

    resp = client.put(f"/api/v1/exercises/{bench}/note", json={"note": "asiento en el 5"})
    assert resp.status_code == 200 and resp.json() == {"note": "asiento en el 5"}
    assert client.get(f"/api/v1/exercises/{bench}/note").json() == {"note": "asiento en el 5"}

    # la nota es POR USUARIO: freyja ve la suya (vacía), no la del admin
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert freyja.get(f"/api/v1/exercises/{bench}/note").json() == {"note": ""}

    # vacía = borrar
    assert client.put(f"/api/v1/exercises/{bench}/note", json={"note": "  "}).json() == {
        "note": ""
    }
    assert client.get(f"/api/v1/exercises/{bench}/note").json() == {"note": ""}


def test_body_photos_are_private(client: TestClient, app):
    resp = client.post(
        "/api/v1/body/photos?photo_date=2026-08-01",
        files={"file": ("antes.png", PNG, "image/png")},
    )
    assert resp.status_code == 201, resp.text
    photo = resp.json()
    assert photo["date"] == "2026-08-01"

    photos = client.get("/api/v1/body/photos").json()
    assert [p["id"] for p in photos] == [photo["id"]]
    assert client.get(f"/api/v1/body/photos/{photo['id']}/file").content == PNG

    # PRIVADAS: ni siquiera un usuario con sharing puede verlas
    make_user(client, "freyja")
    client.post("/api/v1/sharing", json={"username": "freyja"})
    freyja = login(app, "freyja")
    assert freyja.get("/api/v1/body/photos").json() == []
    assert freyja.get(f"/api/v1/body/photos/{photo['id']}/file").status_code == 404
    assert freyja.delete(f"/api/v1/body/photos/{photo['id']}").status_code == 404

    assert client.delete(f"/api/v1/body/photos/{photo['id']}").status_code == 204
    assert client.get("/api/v1/body/photos").json() == []


# ---------- v0.19.x: foto de perfil ----------


def test_avatar_roundtrip_visibility_and_delete(client: TestClient, app):
    me = client.get("/api/v1/auth/me").json()
    assert me["has_avatar"] is False

    resp = client.post(
        "/api/v1/users/me/avatar",
        files={"file": ("cara.png", PNG, "image/png")},
    )
    assert resp.status_code == 204, resp.text
    assert client.get("/api/v1/auth/me").json()["has_avatar"] is True

    got = client.get(f"/api/v1/users/{me['id']}/avatar")
    assert got.status_code == 200
    assert got.content == PNG

    # identidad de la instancia: otro usuario autenticado también lo ve
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert freyja.get(f"/api/v1/users/{me['id']}/avatar").status_code == 200

    assert client.delete("/api/v1/users/me/avatar").status_code == 204
    assert client.get("/api/v1/auth/me").json()["has_avatar"] is False
    assert client.get(f"/api/v1/users/{me['id']}/avatar").status_code == 404


def test_avatar_rejects_non_images(client: TestClient):
    resp = client.post(
        "/api/v1/users/me/avatar",
        files={"file": ("malo.txt", b"hola", "text/plain")},
    )
    assert resp.status_code == 422


# ---------- v0.20.x: imagen de rutina ----------


def test_routine_image_roundtrip_and_rules(client: TestClient, app):
    # crear una rutina propia mínima
    # is_global default a True (v0.4.3): privada EXPLÍCITA para poder
    # asertar las reglas de visibilidad
    resp = client.post(
        "/api/v1/routines", json={"name": "Pierna", "exercises": [], "is_global": False}
    )
    assert resp.status_code == 201, resp.text
    rid = resp.json()["id"]
    assert resp.json()["has_image"] is False

    up = client.post(
        f"/api/v1/routines/{rid}/image",
        files={"file": ("hero.png", PNG, "image/png")},
    )
    assert up.status_code == 204, up.text
    listed = next(r for r in client.get("/api/v1/routines").json() if r["id"] == rid)
    assert listed["has_image"] is True

    got = client.get(f"/api/v1/routines/{rid}/image")
    assert got.status_code == 200
    assert got.content == PNG

    # otro usuario NO ve la imagen de una rutina privada ajena (404, no 403)
    make_user(client, "loki2")
    loki = login(app, "loki2")
    assert loki.get(f"/api/v1/routines/{rid}/image").status_code == 404
    # ...ni puede subirla
    assert loki.post(
        f"/api/v1/routines/{rid}/image", files={"file": ("x.png", PNG, "image/png")}
    ).status_code == 404

    assert client.delete(f"/api/v1/routines/{rid}/image").status_code == 204
    assert client.get(f"/api/v1/routines/{rid}/image").status_code == 404


def test_admin_sees_private_media_of_other_users(client: TestClient, app):
    """v0.23.0 (zurdi: "asumiendo otro user como admin fallan las imágenes de
    hero de las rutinas"): los <img> del navegador no llevan la cabecera
    X-Bk-Act-As, así que bajo act-as llegan con la identidad REAL del admin —
    el GET de media (rutina, foto de cuerpo) hace bypass de visibilidad para
    admins. Un no-admin sigue sin ver nada ajeno privado."""
    make_user(client, "sif")
    sif = login(app, "sif")

    # rutina PRIVADA de sif con imagen
    rid = sif.post(
        "/api/v1/routines", json={"name": "Secreta", "exercises": [], "is_global": False}
    ).json()["id"]
    assert (
        sif.post(
            f"/api/v1/routines/{rid}/image", files={"file": ("h.png", PNG, "image/png")}
        ).status_code
        == 204
    )

    # foto de cuerpo (siempre privada) de sif
    pid = sif.post(
        "/api/v1/body/photos?photo_date=2026-08-01",
        files={"file": ("b.png", PNG, "image/png")},
    ).json()["id"]

    # el ADMIN (client) ve ambas (los ejercicios ya son catálogo global
    # desde v0.20.x: su imagen no entra en este bypass)
    assert client.get(f"/api/v1/routines/{rid}/image").status_code == 200
    assert client.get(f"/api/v1/body/photos/{pid}/file").status_code == 200

    # un tercer usuario NO-admin sigue sin ver nada
    make_user(client, "hodr")
    hodr = login(app, "hodr")
    assert hodr.get(f"/api/v1/routines/{rid}/image").status_code == 404
    assert hodr.get(f"/api/v1/body/photos/{pid}/file").status_code == 404
