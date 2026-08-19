import io
import json
import sqlite3
import zipfile

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import make_engine
from app.main import create_app
from app.services import backup
from tests.conftest import bootstrap


@pytest.fixture
def backup_client(tmp_path, monkeypatch):
    """Cliente con datos reales en disco (BK_DATA_DIR aislado por test).

    A propósito NO reutiliza el fixture `engine` (StaticPool en memoria) del
    resto de la suite: export/restore hacen snapshot y dispose() de verdad, y
    StaticPool.dispose() cierra su única conexión física en caliente aunque
    siga en uso — con un engine de fichero (QueuePool, como en producción) una
    conexión ya extraída del pool sigue viva tras el dispose del pool viejo.
    De paso, migrar con alembic real (en vez de create_all) ejercita el
    camino "upgrade" del restore, no solo el "stamp" de DBs sin historial.
    """
    monkeypatch.setenv("BK_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    settings = get_settings()
    command.upgrade(backup._alembic_config(), "head")
    file_engine = make_engine(settings.db_url)
    app = create_app(engine=file_engine)
    with TestClient(app) as client:
        bootstrap(client)
        yield client, tmp_path
    client.app.state.engine.dispose()
    get_settings.cache_clear()


def _log_a_set(client) -> dict:
    """Crea un entreno con un ejercicio del catálogo global y una serie."""
    exercises = client.get("/api/v1/exercises").json()
    exercise_id = exercises[0]["id"]
    workout = client.post("/api/v1/workouts", json={}).json()
    wex = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises", json={"exercise_id": exercise_id}
    ).json()
    resp = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets",
        json={"reps": 5, "weight_kg": 60},
    )
    assert resp.status_code == 201, resp.text
    return workout


PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082"
)


def _upload_exercise_image(client) -> int:
    exercise_id = client.get("/api/v1/exercises").json()[0]["id"]
    resp = client.post(
        f"/api/v1/exercises/{exercise_id}/image",
        files={"file": ("foto.png", PNG, "image/png")},
    )
    assert resp.status_code == 204, resp.text
    return exercise_id


def _zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return buf.getvalue()


def _valid_manifest() -> bytes:
    return json.dumps({"app": "berserk", "format": 1}).encode()


def test_export_contains_db_and_manifest(backup_client, tmp_path):
    client, _data_dir = backup_client
    _log_a_set(client)

    resp = client.get("/api/v1/backup/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert "berserk-backup-" in resp.headers["content-disposition"]

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        names = zf.namelist()
        assert "berserk.db" in names
        assert "manifest.json" in names
        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["app"] == "berserk"
        assert manifest["format"] == 2
        assert manifest["alembic_revision"] is not None

        db_path = tmp_path / "exported.db"
        db_path.write_bytes(zf.read("berserk.db"))
        conn = sqlite3.connect(db_path)
        assert conn.execute("SELECT count(*) FROM workouts").fetchone()[0] == 1
        conn.close()


def test_restore_roundtrip_brings_data_back_and_lands_on_alembic_head(backup_client, tmp_path):
    client, data_dir = backup_client
    workout = _log_a_set(client)

    backup_zip = client.get("/api/v1/backup/export").content
    assert client.delete(f"/api/v1/workouts/{workout['id']}").status_code == 204
    assert client.get("/api/v1/workouts").json() == []

    resp = client.post(
        "/api/v1/backup/restore",
        files={"file": ("backup.zip", io.BytesIO(backup_zip), "application/zip")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["restored"] is True
    assert data["workouts"] == 1
    assert data["previous_revision"] is not None

    workouts = client.get("/api/v1/workouts").json()
    assert len(workouts) == 1

    script = ScriptDirectory.from_config(backup._alembic_config())
    head = script.get_current_head()
    conn = sqlite3.connect(data_dir / "berserk.db")
    on_disk_revision = conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    conn.close()
    assert on_disk_revision == head


def test_restore_keeps_previous_db_as_one_generation_pre_restore_file(backup_client, tmp_path):
    client, data_dir = backup_client
    _log_a_set(client)
    backup_zip = client.get("/api/v1/backup/export").content

    resp = client.post(
        "/api/v1/backup/restore",
        files={"file": ("backup.zip", io.BytesIO(backup_zip), "application/zip")},
    )
    assert resp.status_code == 200, resp.text
    assert (data_dir / "berserk.db.pre-restore").is_file()


def test_export_returns_409_when_a_restore_is_in_flight(backup_client):
    client, _data_dir = backup_client
    lock = client.app.state.backup_lock
    lock.acquire()
    try:
        resp = client.get("/api/v1/backup/export")
        assert resp.status_code == 409
        assert resp.json()["detail"] == "backup_busy"
    finally:
        lock.release()


def test_restore_returns_409_when_a_restore_is_in_flight(backup_client):
    client, _data_dir = backup_client
    _log_a_set(client)
    backup_zip = client.get("/api/v1/backup/export").content

    lock = client.app.state.backup_lock
    lock.acquire()
    try:
        resp = client.post(
            "/api/v1/backup/restore",
            files={"file": ("backup.zip", io.BytesIO(backup_zip), "application/zip")},
        )
        assert resp.status_code == 409
        assert resp.json()["detail"] == "backup_busy"
    finally:
        lock.release()
    # los datos siguen intactos: la restauración nunca llegó a ejecutarse
    assert len(client.get("/api/v1/workouts").json()) == 1


@pytest.mark.parametrize(
    "build",
    [
        lambda: b"esto no es un zip",
        lambda: _zip({"manifest.json": _valid_manifest()}),  # sin berserk.db
        lambda: _zip({"berserk.db": b"x", "manifest.json": _valid_manifest(), "otra.txt": b"x"}),  # entrada extra
        lambda: _zip({"berserk.db": b"x", "manifest.json": json.dumps({"app": "otra-app", "format": 1}).encode()}),
        lambda: _zip({"berserk.db": b"x", "manifest.json": json.dumps({"app": "berserk", "format": 999}).encode()}),
        lambda: _zip({"berserk.db": b"no soy sqlite", "manifest.json": _valid_manifest()}),
    ],
)
def test_invalid_zip_rejected_and_data_intact(backup_client, build):
    client, _data_dir = backup_client
    _log_a_set(client)

    resp = client.post(
        "/api/v1/backup/restore",
        files={"file": ("backup.zip", io.BytesIO(build()), "application/zip")},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "backup_invalid"
    assert len(client.get("/api/v1/workouts").json()) == 1


def test_oversize_upload_rejected(backup_client, monkeypatch):
    client, _data_dir = backup_client
    _log_a_set(client)
    monkeypatch.setattr(backup, "MAX_RESTORE_BYTES", 10)

    resp = client.post(
        "/api/v1/backup/restore",
        files={"file": ("backup.zip", io.BytesIO(b"x" * 1000), "application/zip")},
    )
    assert resp.status_code == 413
    assert resp.json()["detail"] == "backup_too_large"
    assert len(client.get("/api/v1/workouts").json()) == 1


def test_oversize_extracted_content_rejected(backup_client, monkeypatch):
    client, _data_dir = backup_client
    _log_a_set(client)
    backup_zip = client.get("/api/v1/backup/export").content
    monkeypatch.setattr(backup, "MAX_EXTRACTED_BYTES", 10)

    resp = client.post(
        "/api/v1/backup/restore",
        files={"file": ("backup.zip", io.BytesIO(backup_zip), "application/zip")},
    )
    assert resp.status_code == 413
    assert resp.json()["detail"] == "backup_too_large"
    assert len(client.get("/api/v1/workouts").json()) == 1


def test_unknown_alembic_revision_rejected(backup_client, tmp_path):
    client, _data_dir = backup_client
    _log_a_set(client)

    db_path = tmp_path / "future.db"
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE alembic_version (version_num TEXT)")
    conn.execute("INSERT INTO alembic_version VALUES ('ffffffffffff')")
    conn.commit()
    conn.close()

    resp = client.post(
        "/api/v1/backup/restore",
        files={
            "file": (
                "backup.zip",
                io.BytesIO(_zip({"berserk.db": db_path.read_bytes(), "manifest.json": _valid_manifest()})),
                "application/zip",
            )
        },
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "backup_invalid"
    assert len(client.get("/api/v1/workouts").json()) == 1


def test_non_admin_cannot_export_or_restore(backup_client):
    from tests.conftest import login, make_user

    client, _data_dir = backup_client
    make_user(client, "loki", is_admin=False)
    loki = login(client.app, "loki")

    assert loki.get("/api/v1/backup/export").status_code == 403
    resp = loki.post(
        "/api/v1/backup/restore",
        files={"file": ("backup.zip", io.BytesIO(b"whatever"), "application/zip")},
    )
    assert resp.status_code == 403


# ---------- v0.24.0: los assets viajan con la copia (formato 2) ----------


def test_export_includes_uploads(backup_client):
    client, data_dir = backup_client
    _upload_exercise_image(client)

    resp = client.get("/api/v1/backup/export")
    assert resp.status_code == 200
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        uploads = [n for n in zf.namelist() if n.startswith("uploads/")]
        assert len(uploads) == 1
        assert uploads[0].startswith("uploads/exercises/")
        assert zf.read(uploads[0]) == PNG


def test_restore_roundtrip_brings_assets_back(backup_client):
    client, data_dir = backup_client
    exercise_id = _upload_exercise_image(client)
    exported = client.get("/api/v1/backup/export").content

    # borrar la imagen (DB y fichero) — el restore debe devolver AMBOS
    assert client.delete(f"/api/v1/exercises/{exercise_id}/image").status_code == 204
    assert client.get(f"/api/v1/exercises/{exercise_id}/image").status_code == 404
    assert list((data_dir / "uploads" / "exercises").glob("*")) == []

    resp = client.post(
        "/api/v1/backup/restore", files={"file": ("backup.zip", exported, "application/zip")}
    )
    assert resp.status_code == 200, resp.text
    got = client.get(f"/api/v1/exercises/{exercise_id}/image")
    assert got.status_code == 200
    assert got.content == PNG


def test_format1_restore_leaves_current_uploads_intact(backup_client):
    """Una copia vieja (solo DB) no debe BORRAR los assets de la instancia."""
    client, data_dir = backup_client
    exercise_id = _upload_exercise_image(client)
    image_file = next((data_dir / "uploads" / "exercises").glob("*"))

    exported = client.get("/api/v1/backup/export").content
    with zipfile.ZipFile(io.BytesIO(exported)) as zf:
        db_bytes = zf.read("berserk.db")
    old_zip = _zip({"berserk.db": db_bytes, "manifest.json": _valid_manifest()})

    resp = client.post(
        "/api/v1/backup/restore", files={"file": ("old.zip", old_zip, "application/zip")}
    )
    assert resp.status_code == 200, resp.text
    assert image_file.exists()
    assert client.get(f"/api/v1/exercises/{exercise_id}/image").status_code == 200


def test_zip_with_traversal_upload_entry_rejected(backup_client):
    client, _data_dir = backup_client
    exported = client.get("/api/v1/backup/export").content
    with zipfile.ZipFile(io.BytesIO(exported)) as zf:
        db_bytes = zf.read("berserk.db")
        manifest = zf.read("manifest.json")

    for evil in ["uploads/../evil.png", "otracosa/evil.png", "/uploads/abs.png"]:
        bad = _zip({"berserk.db": db_bytes, "manifest.json": manifest, evil: PNG})
        resp = client.post(
            "/api/v1/backup/restore", files={"file": ("bad.zip", bad, "application/zip")}
        )
        assert resp.status_code == 400, evil
        assert resp.json()["detail"] == "backup_invalid"
