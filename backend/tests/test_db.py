from types import SimpleNamespace

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db import get_db, make_engine, make_sessionmaker


def test_foreign_keys_enforced(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 't.db'}")
    with engine.connect() as conn:
        conn.execute(text("CREATE TABLE a (id INTEGER PRIMARY KEY)"))
        conn.execute(
            text("CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id))")
        )
        with pytest.raises(IntegrityError):
            conn.execute(text("INSERT INTO b (a_id) VALUES (999)"))


def test_wal_mode(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 't.db'}")
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA journal_mode")).scalar() == "wal"


def test_get_db_yields_working_session(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 't.db'}")
    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(sessionmaker=make_sessionmaker(engine)))
    )
    gen = get_db(request)
    db = next(gen)
    assert db.execute(text("SELECT 1")).scalar() == 1
    gen.close()
