"""Backup/restore de la base de datos completa, empaquetada en un ZIP.

El snapshot usa el API de backup de sqlite3 sobre la conexión del propio
engine — nunca se copia el fichero a pelo (WAL podría dejarlo corrupto).
berserk no tiene directorio de uploads: el ZIP contiene solo la DB y un
manifest (mismo método que turtletrips, sin la parte de ficheros).
"""

import json
import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.engine import Engine

from ..config import get_settings
from ..db import make_engine, make_sessionmaker
from ..seed import ensure_catalog

BACKEND_DIR = Path(__file__).resolve().parents[2]
APP_NAME = "berserk"
BACKUP_FORMAT = 1
DB_ENTRY = "berserk.db"
MANIFEST_ENTRY = "manifest.json"
MAX_RESTORE_BYTES = 256 * 1024 * 1024  # 256 MiB comprimidos: las DBs de berserk son pequeñas
MAX_EXTRACTED_BYTES = 1024**3  # 1 GiB descomprimido (anti zip-bomb)


class BackupValidationError(Exception):
    pass


class BackupTooLargeError(BackupValidationError):
    """Subclase para que el router pueda devolver 413 en vez de 400."""


class BackupBusyError(Exception):
    pass


def _alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return cfg


def _db_revision(db_path: Path) -> str | None:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        try:
            row = conn.execute("SELECT version_num FROM alembic_version").fetchone()
        except sqlite3.OperationalError:
            return None  # DB sin tabla alembic (creada con create_all, p. ej. en tests)
        return row[0] if row else None
    finally:
        conn.close()


def snapshot_db(engine: Engine, target: Path) -> None:
    """Copia consistente de la DB del engine (correcta con WAL activo)."""
    raw = engine.raw_connection()
    try:
        dst = sqlite3.connect(target)
        try:
            raw.driver_connection.backup(dst)
        finally:
            dst.close()
    finally:
        raw.close()


def create_backup_zip(engine: Engine) -> Path:
    """Crea el ZIP de backup en data_dir y devuelve su ruta (temporal)."""
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=settings.data_dir, prefix="backup-", suffix=".zip")
    os.close(fd)
    zip_path = Path(tmp_name)

    with tempfile.TemporaryDirectory(dir=settings.data_dir) as workdir:
        db_snapshot = Path(workdir) / DB_ENTRY
        snapshot_db(engine, db_snapshot)
        manifest = {
            "app": APP_NAME,
            "format": BACKUP_FORMAT,
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "alembic_revision": _db_revision(db_snapshot),
        }
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.write(db_snapshot, DB_ENTRY, compress_type=zipfile.ZIP_DEFLATED)
            zf.writestr(MANIFEST_ENTRY, json.dumps(manifest))
    return zip_path


def validate_backup_zip(zip_path: Path) -> str | None:
    """Valida el ZIP y devuelve la revisión alembic de su DB (o None).

    A diferencia de turtletrips (que solo deriva la revisión de la propia
    DB), aquí también se valida el contenido del manifest: sin uploads que
    empaquetar, la lista de entradas esperadas es de tamaño fijo (DB_ENTRY +
    manifest.json) y conviene rechazar cualquier "app"/"format" ajeno cuanto
    antes, no solo una revisión de alembic desconocida.
    """
    if not zipfile.is_zipfile(zip_path):
        raise BackupValidationError("El fichero no es un ZIP válido")
    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        if names != {DB_ENTRY, MANIFEST_ENTRY}:
            raise BackupValidationError("La copia no tiene las entradas esperadas")

        total = 0
        for info in zf.infolist():
            total += info.file_size
            if total > MAX_EXTRACTED_BYTES:
                raise BackupTooLargeError("La copia descomprimida es demasiado grande")

        try:
            manifest = json.loads(zf.read(MANIFEST_ENTRY))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise BackupValidationError("El manifest no es JSON válido") from exc
        if (
            not isinstance(manifest, dict)
            or manifest.get("app") != APP_NAME
            or not isinstance(manifest.get("format"), int)
            or manifest["format"] > BACKUP_FORMAT
        ):
            raise BackupValidationError("La copia no es de esta app o es de un formato más nuevo")

        with tempfile.TemporaryDirectory() as workdir:
            db_path = Path(workdir) / DB_ENTRY
            with zf.open(DB_ENTRY) as src, open(db_path, "wb") as dst:
                shutil.copyfileobj(src, dst)
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            try:
                result = conn.execute("PRAGMA quick_check").fetchone()
            except sqlite3.DatabaseError as exc:
                raise BackupValidationError("La base de datos de la copia está corrupta") from exc
            finally:
                conn.close()
            if result is None or result[0] != "ok":
                raise BackupValidationError("La base de datos de la copia está corrupta")
            revision = _db_revision(db_path)

    if revision is not None:
        script = ScriptDirectory.from_config(_alembic_config())
        try:
            script.get_revision(revision)
        except Exception as exc:
            raise BackupValidationError(
                "La copia es de una versión más nueva de la app "
                f"(revisión {revision} desconocida); actualiza antes de restaurar"
            ) from exc
    return revision


def restore_backup(app: FastAPI, zip_path: Path) -> dict:
    """Sustituye la DB por la del ZIP (ya validado).

    El estado anterior queda en <db_path>.pre-restore como red de seguridad
    de una sola generación (se pisa si ya existía una copia previa); si algo
    falla a mitad, se restaura ese estado y se relanza la excepción.
    """
    lock = app.state.backup_lock
    if not lock.acquire(blocking=False):
        raise BackupBusyError("Ya hay una restauración en curso")
    settings = get_settings()
    db_path = settings.db_path
    wal_path = db_path.with_name(db_path.name + "-wal")
    shm_path = db_path.with_name(db_path.name + "-shm")
    pre_restore = db_path.with_name(db_path.name + ".pre-restore")
    try:
        # snapshot consistente del estado actual (incluye lo que solo vive en
        # el WAL) antes de tocar nada — una sola generación, se pisa la anterior
        if db_path.exists():
            snapshot_db(app.state.engine, pre_restore)
        app.state.engine.dispose()
        db_path.unlink(missing_ok=True)
        wal_path.unlink(missing_ok=True)
        shm_path.unlink(missing_ok=True)

        try:
            with zipfile.ZipFile(zip_path) as zf, zf.open(DB_ENTRY) as src, open(db_path, "wb") as dst:
                shutil.copyfileobj(src, dst)

            previous_revision = _db_revision(db_path)
            cfg = _alembic_config()
            if previous_revision is None:
                # DB sin tabla alembic (backup de un entorno de test con
                # create_all): el esquema ya es el actual, solo hay que marcarlo
                command.stamp(cfg, "head")
            else:
                command.upgrade(cfg, "head")

            engine = make_engine(settings.db_url)
            app.state.engine = engine
            app.state.sessionmaker = make_sessionmaker(engine)
            with app.state.sessionmaker() as session:
                ensure_catalog(session)
                workouts = session.execute(text("SELECT count(*) FROM workouts")).scalar()
            return {
                "restored": True,
                "workouts": int(workouts or 0),
                "previous_revision": previous_revision,
            }
        except Exception:
            # deshacer: borrar lo extraído y devolver el estado anterior
            db_path.unlink(missing_ok=True)
            wal_path.unlink(missing_ok=True)
            shm_path.unlink(missing_ok=True)
            if pre_restore.exists():
                shutil.move(str(pre_restore), str(db_path))
            engine = make_engine(settings.db_url)
            app.state.engine = engine
            app.state.sessionmaker = make_sessionmaker(engine)
            raise
    finally:
        lock.release()
