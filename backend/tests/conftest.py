import os
import tempfile

# Debe fijarse antes de importar la app: get_settings() lee el entorno una sola vez
os.environ["BK_DATA_DIR"] = tempfile.mkdtemp(prefix="bk-test-")
# coste mínimo de bcrypt: cada test hace bootstrap/login y el coste real sumaría minutos
os.environ["BK_BCRYPT_ROUNDS"] = "4"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

from app.db import Base, make_sessionmaker
from app.main import create_app


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


# credenciales del admin que crea el fixture `client` vía bootstrap
ADMIN = {"username": "admin", "password": "admin1234"}


def bootstrap(client: TestClient) -> dict:
    """Crea la cuenta admin inicial; la cookie de sesión queda en el client."""
    resp = client.post("/api/v1/auth/bootstrap", json=ADMIN)
    assert resp.status_code == 201, resp.text
    return resp.json()


def login(app, username: str, password: str = "secret123") -> TestClient:
    """Cliente nuevo con su propia cookie jar, logueado como `username`."""
    client = TestClient(app)
    resp = client.post(
        "/api/v1/auth/login", json={"username": username, "password": password}
    )
    assert resp.status_code == 200, resp.text
    return client


@pytest.fixture
def app(engine):
    return create_app(engine=engine)


@pytest.fixture
def client(app):
    """Cliente logueado como el admin inicial."""
    with TestClient(app) as client:
        bootstrap(client)
        yield client


@pytest.fixture
def anon(app):
    """Cliente sin sesión."""
    with TestClient(app) as client:
        yield client


def make_user(
    admin_client: TestClient,
    username: str,
    *,
    password: str = "secret123",
    is_admin: bool = False,
) -> dict:
    """Crea un usuario vía la API de admin."""
    resp = admin_client.post(
        "/api/v1/admin/users",
        json={"username": username, "password": password, "is_admin": is_admin},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
