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
