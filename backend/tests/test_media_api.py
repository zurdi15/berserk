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


def test_avatar_version_tracks_uploads_and_file_is_cacheable(client: TestClient):
    """v0.25.2 — la URL del avatar se versiona con avatar_version (raíz uuid
    del fichero, nueva por subida) y el fichero viaja con Cache-Control: el
    navegador deja de refetchear la foto en cada visita al perfil."""
    me = client.get("/api/v1/auth/me").json()
    assert me["avatar_version"] is None

    assert (
        client.post(
            "/api/v1/users/me/avatar", files={"file": ("cara.png", PNG, "image/png")}
        ).status_code
        == 204
    )
    v1 = client.get("/api/v1/auth/me").json()["avatar_version"]
    assert v1

    resp = client.get(f"/api/v1/users/{me['id']}/avatar")
    assert resp.status_code == 200
    assert "max-age=604800" in resp.headers["cache-control"]

    # re-subir cambia la versión (uuid de fichero nuevo)
    assert (
        client.post(
            "/api/v1/users/me/avatar", files={"file": ("cara2.png", PNG, "image/png")}
        ).status_code
        == 204
    )
    v2 = client.get("/api/v1/auth/me").json()["avatar_version"]
    assert v2 and v2 != v1


def test_lqip_generated_on_upload_and_served_with_lq_param(client: TestClient, app):
    """v0.26.0 — cada subida genera su miniatura .lq.jpg; ?lq=1 la sirve (y
    cae a la original si no existe); borrar la imagen borra ambas.
    OJO: el PNG-fixture de este módulo es hex troceado que Pillow rechaza —
    aquí hace falta una imagen REAL, generada con la propia Pillow."""
    import io

    from PIL import Image

    from app.config import get_settings
    from app.services.images import backfill_lq, lq_path_for

    buffer = io.BytesIO()
    Image.new("RGB", (200, 300), (79, 216, 196)).save(buffer, format="PNG")
    real_png = buffer.getvalue()

    bench = _bench(client)
    uploads = get_settings().data_dir / "uploads" / "exercises"
    # el data_dir se comparte con el resto de la suite: identificar MI
    # fichero por diff antes/después, no asumiendo el directorio vacío
    before = set(uploads.iterdir()) if uploads.is_dir() else set()
    assert (
        client.post(
            f"/api/v1/exercises/{bench}/image", files={"file": ("f.png", real_png, "image/png")}
        ).status_code
        == 204
    )
    originals = [f for f in set(uploads.iterdir()) - before if not f.name.endswith(".lq.jpg")]
    assert len(originals) == 1
    lq_file = lq_path_for(originals[0])
    assert lq_file.is_file()

    full = client.get(f"/api/v1/exercises/{bench}/image")
    small = client.get(f"/api/v1/exercises/{bench}/image?lq=1")
    assert small.status_code == 200
    assert small.content == lq_file.read_bytes()
    assert small.content != full.content

    # sin LQIP en disco, ?lq=1 cae a la original (mejor que un 404)
    lq_file.unlink()
    fallback = client.get(f"/api/v1/exercises/{bench}/image?lq=1")
    assert fallback.content == full.content

    # el backfill lo regenera
    assert backfill_lq(get_settings().data_dir / "uploads") >= 1
    assert lq_file.is_file()

    # borrar la imagen limpia original + LQIP
    assert client.delete(f"/api/v1/exercises/{bench}/image").status_code == 204
    assert not originals[0].exists()
    assert not lq_file.exists()
