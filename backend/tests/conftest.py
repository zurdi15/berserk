import os
import tempfile

# Debe fijarse antes de importar la app: get_settings() lee el entorno una sola vez
os.environ["BK_DATA_DIR"] = tempfile.mkdtemp(prefix="bk-test-")
# coste mínimo de bcrypt: cada test hace bootstrap/login y el coste real sumaría minutos
os.environ["BK_BCRYPT_ROUNDS"] = "4"

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

from app.db import Base, make_sessionmaker


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(engine):
    maker = make_sessionmaker(engine)
    session = maker()
    yield session
    session.close()
