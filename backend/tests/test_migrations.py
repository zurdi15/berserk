"""Pruebas de migraciones de verdad (alembic upgrade real, no create_all):
el resto de la suite usa Base.metadata.create_all sobre SQLite en memoria
(ver conftest.engine), que nunca ejercita el camino de backfill de una
migración sobre datos YA existentes de un despliegue previo. Mismo patrón
que test_backup.py: BK_DATA_DIR a un tmp_path + get_settings.cache_clear()
+ alembic.command contra ese fichero.
"""

import sqlite3

from alembic import command

from app.config import get_settings
from app.services import backup as backup_service

# head justo antes de añadir la columna rune (54870c586688): migrar hasta
# aquí deja muscle_groups con el esquema VIEJO (sin rune), igual que una
# instancia desplegada antes de este cambio
PRE_RUNE_REVISION = "37bd10b715d5"


def _migrate_to(cfg, tmp_path, revision, monkeypatch):
    monkeypatch.setenv("BK_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    command.upgrade(cfg, revision)
    return get_settings()


def test_rune_column_backfills_known_group_slugs_only(tmp_path, monkeypatch):
    cfg = backup_service._alembic_config()
    settings = _migrate_to(cfg, tmp_path, PRE_RUNE_REVISION, monkeypatch)

    # puebla muscle_groups con el esquema viejo (sin columna rune): un grupo
    # "canónico" (slug conocido) y uno custom con un slug fuera del set
    conn = sqlite3.connect(settings.db_path)
    conn.execute(
        "INSERT INTO muscle_groups (slug, name_es, name_en, owner_id) VALUES (?, ?, ?, NULL)",
        ("chest", "Pecho", "Chest"),
    )
    conn.execute(
        "INSERT INTO muscle_groups (slug, name_es, name_en, owner_id) VALUES (?, ?, ?, NULL)",
        ("glutes", "Glúteos", "Glutes"),
    )
    conn.commit()
    conn.close()

    command.upgrade(cfg, "head")

    conn = sqlite3.connect(settings.db_path)
    rows = dict(conn.execute("SELECT slug, rune FROM muscle_groups").fetchall())
    conn.close()

    # backfill solo para los 7 slugs conocidos (ver _KNOWN_GROUP_RUNE_SLUGS
    # de la migración): "chest" recupera su icono de siempre, "glutes"
    # (custom, nunca tuvo runa) se queda NULL en vez de inventar una
    assert rows["chest"] == "chest"
    assert rows["glutes"] is None


def test_rune_column_downgrade_drops_it(tmp_path, monkeypatch):
    cfg = backup_service._alembic_config()
    settings = _migrate_to(cfg, tmp_path, "head", monkeypatch)

    conn = sqlite3.connect(settings.db_path)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(muscle_groups)")}
    conn.close()
    assert "rune" in columns

    command.downgrade(cfg, PRE_RUNE_REVISION)

    conn = sqlite3.connect(settings.db_path)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(muscle_groups)")}
    conn.close()
    assert "rune" not in columns


# ── v0.5.0 superseries: 1162ad243925 añade superset_group (nullable) a
# routine_exercises Y workout_exercises en una sola migración ──────────────

# head justo antes de superset_group: esquema viejo, sin la columna en
# ninguna de las dos tablas — igual que una instancia desplegada en v0.4.x
PRE_SUPERSET_REVISION = "fbf6cb158a4e"


def test_superset_group_migration_applies_over_existing_rows(tmp_path, monkeypatch):
    cfg = backup_service._alembic_config()
    settings = _migrate_to(cfg, tmp_path, PRE_SUPERSET_REVISION, monkeypatch)

    # filas preexistentes con el esquema viejo (FKs sin enforcement en esta
    # conexión sqlite3 cruda: solo interesa que la migración no rompa filas)
    conn = sqlite3.connect(settings.db_path)
    conn.execute(
        "INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets)"
        " VALUES (1, 1, 1, 3)"
    )
    conn.execute(
        "INSERT INTO workout_exercises (workout_id, exercise_id, position) VALUES (1, 1, 1)"
    )
    conn.commit()
    conn.close()

    command.upgrade(cfg, "head")

    conn = sqlite3.connect(settings.db_path)
    for table in ("routine_exercises", "workout_exercises"):
        columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        assert "superset_group" in columns
    # sin backfill: todo lo preexistente queda suelto (NULL)
    assert conn.execute("SELECT superset_group FROM routine_exercises").fetchone() == (None,)
    assert conn.execute("SELECT superset_group FROM workout_exercises").fetchone() == (None,)
    conn.close()


def test_superset_group_downgrade_drops_both_columns(tmp_path, monkeypatch):
    cfg = backup_service._alembic_config()
    settings = _migrate_to(cfg, tmp_path, "head", monkeypatch)

    command.downgrade(cfg, PRE_SUPERSET_REVISION)

    conn = sqlite3.connect(settings.db_path)
    for table in ("routine_exercises", "workout_exercises"):
        columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        assert "superset_group" not in columns
    conn.close()
