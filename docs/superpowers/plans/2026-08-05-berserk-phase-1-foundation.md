# berserk Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working authenticated skeleton of berserk: FastAPI backend with server-side session auth, admin user management and invites, a placeholder SPA, single-image Docker build, dev script and CI.

**Architecture:** Monorepo `backend/` + `frontend/` cloned from the turtletrips shape. Backend is FastAPI + SQLAlchemy 2.0 + Alembic over a single SQLite file; auth is server-side sessions (HttpOnly cookie, sha256 token at rest, sliding expiry). Frontend in this phase is only a buildable Vite + Vue + TS placeholder so Docker and dev.sh work end to end; the real design system arrives in Phase 3.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2.0, Alembic, pydantic-settings, bcrypt, uv; Vue 3 + TypeScript + Vite; Docker multi-stage; GitHub Actions.

## Global Constraints

- Python `>=3.13`, dependencies managed with uv + `uv.lock` committed.
- Env prefix `BK_`; data dir `BK_DATA_DIR` (default `/data`), DB file `berserk.db`.
- All API routes under `/api/v1`. No mutating GETs, ever (CSRF model depends on it).
- Session cookie `bk_session`: HttpOnly, SameSite=Lax, `secure` from `BK_COOKIE_SECURE`; DB stores only sha256 of the token; sliding TTL `BK_SESSION_TTL_DAYS` (default 30).
- HTTP error `detail` values are stable snake_case slugs (e.g. `not_authenticated`) — the frontend maps them through i18n.
- SQLite pragmas: `journal_mode=WAL`, `foreign_keys=ON`. All datetimes naive UTC.
- Identifiers in English; comments and docstrings in Spanish (turtletrips style). Comments only for "why", never "what".
- Conventional commit messages (`feat:`, `test:`, `chore:`, `ci:`).
- Backend commands run from `backend/`: `uv run pytest`, `uv run alembic ...`. Tests use in-memory SQLite (StaticPool) and `BK_BCRYPT_ROUNDS=4`.

---

### Task 1: Backend scaffold and settings

**Files:**
- Create: `.gitignore`
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/tests/__init__.py` (empty — makes `from tests.conftest import ...` importable)
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Produces: `Settings` (pydantic-settings, env prefix `BK_`) with fields `data_dir: Path`, `serve_static: bool`, `session_ttl_days: int`, `cookie_secure: bool`, `bcrypt_rounds: int`, `invite_ttl_hours: int`, properties `db_path: Path`, `db_url: str`; `get_settings() -> Settings` (lru_cached).

- [ ] **Step 1: Write `.gitignore`, package skeleton and pyproject**

`.gitignore`:

```gitignore
__pycache__/
.venv/
.pytest_cache/
data/
node_modules/
dist/
```

`backend/app/__init__.py` and `backend/tests/__init__.py`: empty files.

`backend/pyproject.toml`:

```toml
[project]
name = "berserk-backend"
version = "0.1.0"
description = "Backend de berserk: workout tracker self-hosted"
requires-python = ">=3.13"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "sqlalchemy>=2.0",
    "alembic>=1.14",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "bcrypt>=4.2",
]

[dependency-groups]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
]

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff.lint.flake8-bugbear]
# Depends/Query/Form en defaults es el idiom oficial de FastAPI
extend-immutable-calls = ["fastapi.Depends", "fastapi.Query", "fastapi.Form", "fastapi.File"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools]
packages = ["app"]
```

`backend/tests/conftest.py`:

```python
import os
import tempfile

# Debe fijarse antes de importar la app: get_settings() lee el entorno una sola vez
os.environ["BK_DATA_DIR"] = tempfile.mkdtemp(prefix="bk-test-")
# coste mínimo de bcrypt: cada test hace bootstrap/login y el coste real sumaría minutos
os.environ["BK_BCRYPT_ROUNDS"] = "4"
```

- [ ] **Step 2: Write the failing test**

`backend/tests/test_config.py`:

```python
from pathlib import Path

from app.config import Settings


def test_db_url_derives_from_data_dir(tmp_path: Path):
    s = Settings(data_dir=tmp_path)
    assert s.db_path == tmp_path / "berserk.db"
    assert s.db_url == f"sqlite:///{tmp_path / 'berserk.db'}"


def test_env_overrides_with_bk_prefix(monkeypatch):
    monkeypatch.setenv("BK_SESSION_TTL_DAYS", "7")
    monkeypatch.setenv("BK_COOKIE_SECURE", "true")
    s = Settings()
    assert s.session_ttl_days == 7
    assert s.cookie_secure is True
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv sync && uv run pytest -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.config'`

- [ ] **Step 4: Write minimal implementation**

`backend/app/config.py`:

```python
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BK_")

    data_dir: Path = Path("/data")
    # en dev (dev.sh) se pone a 0 para que :8000 no sirva una SPA compilada obsoleta
    serve_static: bool = True
    # duración de la sesión (cookie bk_session); se renueva sola al usar la app
    session_ttl_days: int = 30
    # marcar la cookie como Secure (activar en despliegues con HTTPS)
    cookie_secure: bool = False
    # coste de bcrypt (los tests lo bajan a 4 para no pagar el coste real por hash)
    bcrypt_rounds: int = 12
    # validez de los enlaces de invitación que genera el admin
    invite_ttl_hours: int = 72

    @property
    def db_path(self) -> Path:
        return self.data_dir / "berserk.db"

    @property
    def db_url(self) -> str:
        return f"sqlite:///{self.db_path}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest -v`
Expected: 2 passed

- [ ] **Step 6: Commit**

```bash
git add .gitignore backend/
git commit -m "feat: backend scaffold with BK_ settings"
```

---

### Task 2: SQLite engine with WAL and enforced foreign keys

**Files:**
- Create: `backend/app/db.py`
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Produces: `Base` (DeclarativeBase), `make_engine(db_url: str) -> Engine`, `make_sessionmaker(engine) -> sessionmaker[Session]`, `get_db(request) -> Iterator[Session]` (FastAPI dependency reading `request.app.state.sessionmaker`).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_db.py`:

```python
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db import make_engine


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.db'`

- [ ] **Step 3: Write minimal implementation**

`backend/app/db.py`:

```python
from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(db_url: str) -> Engine:
    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _record) -> None:
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    return engine


def make_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db(request: Request) -> Iterator[Session]:
    db: Session = request.app.state.sessionmaker()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_db.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/db.py backend/tests/test_db.py
git commit -m "feat: sqlite engine with WAL and enforced FKs"
```

---

### Task 3: Auth models and Alembic baseline

**Files:**
- Create: `backend/app/models.py`
- Create: `backend/alembic.ini` + `backend/alembic/` (via `alembic init`, then replace `env.py`)
- Modify: `backend/tests/conftest.py` (add `engine` and `db_session` fixtures)
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Produces: `utcnow() -> datetime` (naive UTC); models `User(id, username, password_hash, is_admin, locale, units, timezone, created_at, sessions)`, `AuthSession(id, user_id, token_hash, expires_at, user)`, `Invite(id, token_hash, created_by, created_at, expires_at, used_by, used_at)`; conftest fixtures `engine`, `db_session`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_models.py`:

```python
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app import models


def test_user_defaults(db_session):
    user = models.User(username="thor", password_hash="x")
    db_session.add(user)
    db_session.commit()
    assert user.is_admin is False
    assert user.locale == "es"
    assert user.units == "kg"
    assert user.timezone == "Europe/Madrid"
    assert user.created_at is not None


def test_username_unique(db_session):
    db_session.add(models.User(username="thor", password_hash="x"))
    db_session.commit()
    db_session.add(models.User(username="thor", password_hash="y"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_deleting_user_cascades_sessions(db_session):
    user = models.User(username="thor", password_hash="x")
    db_session.add(user)
    db_session.commit()
    db_session.add(
        models.AuthSession(user_id=user.id, token_hash="h", expires_at=models.utcnow())
    )
    db_session.commit()
    db_session.delete(user)
    db_session.commit()
    assert db_session.scalar(select(models.AuthSession)) is None
```

Add to `backend/tests/conftest.py` (below the `os.environ` lines):

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models'` (conftest import of `app.db` must NOT fail — that part already exists)

- [ ] **Step 3: Write minimal implementation**

`backend/app/models.py`:

```python
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    """UTC naive, coherente con el resto de fechas de la app."""
    return datetime.now(UTC).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    is_admin: Mapped[bool] = mapped_column(default=False)
    locale: Mapped[str] = mapped_column(String(5), default="es")
    units: Mapped[str] = mapped_column(String(2), default="kg")
    timezone: Mapped[str] = mapped_column(String(50), default="Europe/Madrid")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)

    user: Mapped[User] = relationship(back_populates="sessions")


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_models.py -v`
Expected: 3 passed

- [ ] **Step 5: Initialize Alembic and generate the baseline migration**

```bash
cd backend
uv run alembic init alembic
```

Replace `backend/alembic/env.py` entirely with:

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import get_settings
from app.db import Base
from app import models  # noqa: F401  (registra las tablas en Base.metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
config.set_main_option("sqlalchemy.url", settings.db_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # necesario para ALTER TABLE en SQLite
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

Leave the generated `alembic.ini` untouched (env.py overrides the URL). Then:

```bash
BK_DATA_DIR="$PWD/../data" uv run alembic revision --autogenerate -m "auth tables"
BK_DATA_DIR="$PWD/../data" uv run alembic upgrade head
```

- [ ] **Step 6: Verify the migrated schema**

Run (from `backend/`):

```bash
uv run python -c "
import sqlite3
rows = sqlite3.connect('../data/berserk.db').execute(
    \"select name from sqlite_master where type='table' order by name\")
print([r[0] for r in rows])
"
```

Expected: `['alembic_version', 'auth_sessions', 'invites', 'users']`

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py backend/tests/ backend/alembic.ini backend/alembic/
git commit -m "feat: auth models with alembic baseline"
```

---

### Task 4: Session auth service

**Files:**
- Create: `backend/app/auth.py`
- Test: `backend/tests/test_auth_service.py`

**Interfaces:**
- Consumes: `get_settings()`, `get_db`, models `User`/`AuthSession`, `utcnow()`.
- Produces: `SESSION_COOKIE = "bk_session"`; `hash_password(str) -> str`; `verify_password(str, str) -> bool`; `dummy_password_check(str) -> None`; `create_session(db, user) -> str`; `revoke_session(db, raw_token) -> None`; `revoke_other_sessions(db, user_id, keep_raw_token: str | None) -> None`; `resolve_session_user(db, raw_token) -> User | None`; `get_current_user` / `require_admin` dependencies; `CurrentUser` / `AdminUser` annotated types; `set_session_cookie(response, token)` / `clear_session_cookie(response)`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_auth_service.py`:

```python
from datetime import timedelta

from sqlalchemy import select

from app import auth, models


def make_user(db_session) -> models.User:
    user = models.User(username="thor", password_hash=auth.hash_password("secret123"))
    db_session.add(user)
    db_session.commit()
    return user


def test_password_hash_roundtrip():
    hashed = auth.hash_password("secret123")
    assert auth.verify_password("secret123", hashed)
    assert not auth.verify_password("wrong", hashed)


def test_session_roundtrip(db_session):
    user = make_user(db_session)
    token = auth.create_session(db_session, user)
    resolved = auth.resolve_session_user(db_session, token)
    assert resolved is not None and resolved.id == user.id
    assert auth.resolve_session_user(db_session, "bogus") is None


def test_revoke_session(db_session):
    user = make_user(db_session)
    token = auth.create_session(db_session, user)
    auth.revoke_session(db_session, token)
    assert auth.resolve_session_user(db_session, token) is None


def test_expired_session_is_deleted(db_session):
    user = make_user(db_session)
    token = auth.create_session(db_session, user)
    session = db_session.scalar(select(models.AuthSession))
    session.expires_at = models.utcnow() - timedelta(seconds=1)
    db_session.commit()
    assert auth.resolve_session_user(db_session, token) is None
    assert db_session.scalar(select(models.AuthSession)) is None


def test_sliding_renewal_past_half_ttl(db_session):
    user = make_user(db_session)
    token = auth.create_session(db_session, user)
    session = db_session.scalar(select(models.AuthSession))
    # a 1 día de caducar (< ttl/2 = 15 días) debe renovarse a ttl completo
    session.expires_at = models.utcnow() + timedelta(days=1)
    db_session.commit()
    auth.resolve_session_user(db_session, token)
    renewed = db_session.scalar(select(models.AuthSession))
    assert renewed.expires_at > models.utcnow() + timedelta(days=29)


def test_revoke_other_sessions_keeps_current(db_session):
    user = make_user(db_session)
    keep = auth.create_session(db_session, user)
    auth.create_session(db_session, user)
    auth.revoke_other_sessions(db_session, user.id, keep)
    remaining = db_session.scalars(select(models.AuthSession)).all()
    assert len(remaining) == 1
    assert auth.resolve_session_user(db_session, keep) is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_auth_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.auth'`

- [ ] **Step 3: Write minimal implementation**

`backend/app/auth.py`:

```python
"""Autenticación: passwords con bcrypt y sesiones server-side en DB.

El token de sesión es aleatorio de entropía plena y viaja en una cookie
HttpOnly; en DB solo se guarda su sha256 (lookup directo por índice, sin
claves de firma que gestionar). SameSite=Lax + ningún GET mutante = CSRF
cubierto sin tokens extra.
"""

import hashlib
import secrets
from datetime import timedelta
from typing import Annotated

import bcrypt
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import AuthSession, User, utcnow

SESSION_COOKIE = "bk_session"

# hash fijo (lazy) para verificar contra algo cuando el usuario no existe
# (misma latencia que un login fallido real: no filtra existencia por timing)
_dummy_hash: str | None = None


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def dummy_password_check(password: str) -> None:
    """Consume el mismo tiempo que un login fallido real (usuario inexistente)."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password("bk-dummy-password")
    verify_password(password, _dummy_hash)


def _token_hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def create_session(db: Session, user: User) -> str:
    """Crea una sesión y devuelve el token en claro (solo existe en la cookie)."""
    ttl = timedelta(days=get_settings().session_ttl_days)
    # limpieza oportunista de sesiones caducadas (no hay cron)
    db.execute(delete(AuthSession).where(AuthSession.expires_at < utcnow()))
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            user_id=user.id, token_hash=_token_hash(token), expires_at=utcnow() + ttl
        )
    )
    db.commit()
    return token


def revoke_session(db: Session, raw_token: str) -> None:
    db.execute(delete(AuthSession).where(AuthSession.token_hash == _token_hash(raw_token)))
    db.commit()


def revoke_other_sessions(db: Session, user_id: int, keep_raw_token: str | None) -> None:
    """Revoca todas las sesiones del usuario salvo, opcionalmente, la actual."""
    query = delete(AuthSession).where(AuthSession.user_id == user_id)
    if keep_raw_token:
        query = query.where(AuthSession.token_hash != _token_hash(keep_raw_token))
    db.execute(query)
    db.commit()


def resolve_session_user(db: Session, raw_token: str) -> User | None:
    """Usuario de un token válido; renueva la caducidad si va por la mitad."""
    session = db.scalar(
        select(AuthSession).where(AuthSession.token_hash == _token_hash(raw_token))
    )
    if session is None:
        return None
    now = utcnow()
    if session.expires_at < now:
        db.delete(session)
        db.commit()
        return None
    ttl = timedelta(days=get_settings().session_ttl_days)
    if session.expires_at - now < ttl / 2:
        session.expires_at = now + ttl
        db.commit()
    return db.get(User, session.user_id)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    user = resolve_session_user(db, token) if token else None
    if user is None:
        raise HTTPException(status_code=401, detail="not_authenticated")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="admin_only")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=get_settings().session_ttl_days * 86400,
        httponly=True,
        samesite="lax",
        secure=get_settings().cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_auth_service.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth.py backend/tests/test_auth_service.py
git commit -m "feat: server-side session auth service"
```

---

### Task 5: App factory, health, status and bootstrap

**Files:**
- Create: `backend/app/main.py`
- Create: `backend/app/asgi.py`
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/routers/auth.py`
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/auth.py`
- Modify: `backend/tests/conftest.py` (add `app`, `client`, `anon` fixtures + helpers)
- Test: `backend/tests/test_bootstrap.py`

**Interfaces:**
- Consumes: `make_engine`, `make_sessionmaker`, `get_settings`, auth service from Task 4.
- Produces: `create_app(engine: Engine | None = None) -> FastAPI`; `API_PREFIX = "/api/v1"`; endpoints `GET /api/v1/health`, `GET /api/v1/auth/status`, `POST /api/v1/auth/bootstrap`; schemas `Credentials(username, password)`, `UserOut(id, username, is_admin, locale, units, timezone)`, `StatusOut(bootstrapped)`; conftest `ADMIN` dict, `bootstrap(client)`, fixtures `app`, `client` (admin session), `anon`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_bootstrap.py`:

```python
from fastapi.testclient import TestClient

from tests.conftest import ADMIN


def test_health(anon: TestClient):
    resp = anon.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_status_flips_after_bootstrap(app):
    with TestClient(app) as fresh:
        assert fresh.get("/api/v1/auth/status").json() == {"bootstrapped": False}
        resp = fresh.post("/api/v1/auth/bootstrap", json=ADMIN)
        assert resp.status_code == 201
        body = resp.json()
        assert body["username"] == ADMIN["username"]
        assert body["is_admin"] is True
        assert "password" not in body and "password_hash" not in body
        assert fresh.get("/api/v1/auth/status").json() == {"bootstrapped": True}


def test_bootstrap_sets_session_cookie(app):
    with TestClient(app) as fresh:
        fresh.post("/api/v1/auth/bootstrap", json=ADMIN)
        assert fresh.get("/api/v1/auth/me").status_code == 200


def test_bootstrap_conflicts_when_users_exist(client: TestClient):
    resp = client.post(
        "/api/v1/auth/bootstrap", json={"username": "odin", "password": "password1"}
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "already_bootstrapped"
```

Add to `backend/tests/conftest.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app

# credenciales del admin que crea el fixture `client` vía bootstrap
ADMIN = {"username": "admin", "password": "admin1234"}


def bootstrap(client: TestClient) -> dict:
    """Crea la cuenta admin inicial; la cookie de sesión queda en el client."""
    resp = client.post("/api/v1/auth/bootstrap", json=ADMIN)
    assert resp.status_code == 201, resp.text
    return resp.json()


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_bootstrap.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 3: Write minimal implementation**

`backend/app/schemas/__init__.py`: empty file.

`backend/app/schemas/auth.py`:

```python
from pydantic import BaseModel, Field


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=100)


class LoginIn(BaseModel):
    username: str
    password: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=100)


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool
    locale: str
    units: str
    timezone: str

    model_config = {"from_attributes": True}


class StatusOut(BaseModel):
    bootstrapped: bool
```

`backend/app/routers/__init__.py`: empty file.

`backend/app/routers/auth.py` (this task only adds status + bootstrap + a minimal `/me`; login/logout arrive in Task 6):

```python
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import CurrentUser, create_session, hash_password, set_session_cookie
from ..db import get_db
from ..models import User
from ..schemas.auth import Credentials, StatusOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status", response_model=StatusOut)
def status(db: Session = Depends(get_db)):
    return StatusOut(bootstrapped=bool(db.scalar(select(func.count(User.id)))))


@router.post("/bootstrap", response_model=UserOut, status_code=201)
def bootstrap(payload: Credentials, response: Response, db: Session = Depends(get_db)):
    """Primera cuenta de la instancia: siempre admin, solo con 0 usuarios."""
    if db.scalar(select(func.count(User.id))):
        raise HTTPException(status_code=409, detail="already_bootstrapped")
    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        is_admin=True,
    )
    db.add(user)
    db.commit()
    set_session_cookie(response, create_session(db, user))
    return user


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
```

`backend/app/main.py`:

```python
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.engine import Engine

from .config import get_settings
from .db import make_engine, make_sessionmaker
from .routers import auth

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
API_PREFIX = "/api/v1"


def create_app(engine: Engine | None = None) -> FastAPI:
    settings = get_settings()
    if engine is None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        engine = make_engine(settings.db_url)

    app = FastAPI(
        title="berserk",
        description="Workout tracker self-hosted",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.state.engine = engine
    app.state.sessionmaker = make_sessionmaker(engine)

    # públicos: auth gestiona su propia protección endpoint a endpoint
    app.include_router(auth.router, prefix=API_PREFIX)

    @app.get(f"{API_PREFIX}/health", tags=["health"])
    def health():
        return {"status": "ok"}

    if settings.serve_static and STATIC_DIR.is_dir():
        assets_dir = STATIC_DIR / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        @app.head("/{full_path:path}", include_in_schema=False)
        def spa_fallback(full_path: str):
            if full_path.startswith("api/"):
                return FileResponse(STATIC_DIR / "index.html", status_code=404)
            candidate = (STATIC_DIR / full_path).resolve()
            if (
                full_path
                and candidate.is_relative_to(STATIC_DIR)
                and candidate.is_file()
            ):
                # el service worker y el manifest nunca deben cachearse por HTTP:
                # un sw.js viejo retrasaría los deploys de la PWA
                if full_path == "sw.js":
                    return FileResponse(candidate, headers={"Cache-Control": "no-cache"})
                if full_path == "manifest.webmanifest":
                    return FileResponse(
                        candidate,
                        media_type="application/manifest+json",
                        headers={"Cache-Control": "no-cache"},
                    )
                return FileResponse(candidate)
            if full_path == "favicon.ico":
                raise HTTPException(status_code=404)
            # el index nunca debe cachearse: referencia assets con hash que
            # cambian en cada build (index viejo = assets rotos tras desplegar)
            return FileResponse(
                STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"}
            )

    else:

        @app.get("/", include_in_schema=False)
        def dev_root():
            return HTMLResponse(
                "<h1>berserk · backend</h1>"
                "<p>Modo dev: la app se sirve en "
                "<a href='http://localhost:5173'>http://localhost:5173</a> "
                "(Vite con hot reload). Docs de la API: "
                "<a href='/api/docs'>/api/docs</a>.</p>"
            )

    return app
```

`backend/app/asgi.py`:

```python
from .main import create_app

app = create_app()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest -v`
Expected: all tests pass (config, db, models, auth service, bootstrap)

- [ ] **Step 5: Commit**

```bash
git add backend/app/ backend/tests/
git commit -m "feat: app factory with health, status and bootstrap"
```

---

### Task 6: Login, logout and password change

**Files:**
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/tests/conftest.py` (add `login` helper)
- Test: `backend/tests/test_login.py`

**Interfaces:**
- Consumes: Task 4 service, Task 5 router/schemas.
- Produces: `POST /api/v1/auth/login` (200, sets cookie), `POST /api/v1/auth/logout` (204, clears cookie), `POST /api/v1/auth/password` (204, revokes other sessions); conftest helper `login(app, username, password="secret123") -> TestClient`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_login.py`:

```python
from fastapi.testclient import TestClient

from tests.conftest import ADMIN


def test_login_ok(client: TestClient, app):
    with TestClient(app) as fresh:
        resp = fresh.post("/api/v1/auth/login", json=ADMIN)
        assert resp.status_code == 200
        assert resp.json()["username"] == ADMIN["username"]
        assert fresh.get("/api/v1/auth/me").status_code == 200


def test_login_wrong_password(client: TestClient, app):
    with TestClient(app) as fresh:
        resp = fresh.post(
            "/api/v1/auth/login",
            json={"username": ADMIN["username"], "password": "nope-nope"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "invalid_credentials"


def test_login_unknown_user_same_error(client: TestClient, app):
    with TestClient(app) as fresh:
        resp = fresh.post(
            "/api/v1/auth/login", json={"username": "ghost", "password": "whatever1"}
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "invalid_credentials"


def test_me_requires_session(anon: TestClient):
    assert anon.get("/api/v1/auth/me").status_code == 401


def test_logout_revokes_session(client: TestClient):
    assert client.get("/api/v1/auth/me").status_code == 200
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_password_change(client: TestClient, app):
    resp = client.post(
        "/api/v1/auth/password",
        json={"current_password": ADMIN["password"], "new_password": "newpass123"},
    )
    assert resp.status_code == 204
    # la sesión actual sigue viva y la nueva contraseña funciona en un client nuevo
    assert client.get("/api/v1/auth/me").status_code == 200
    with TestClient(app) as fresh:
        assert (
            fresh.post(
                "/api/v1/auth/login",
                json={"username": ADMIN["username"], "password": "newpass123"},
            ).status_code
            == 200
        )
        assert (
            fresh.post("/api/v1/auth/login", json=ADMIN).status_code == 401
        )


def test_password_change_wrong_current(client: TestClient):
    resp = client.post(
        "/api/v1/auth/password",
        json={"current_password": "wrong-one", "new_password": "newpass123"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "wrong_password"


def test_password_change_revokes_other_sessions(client: TestClient, app):
    other = TestClient(app)
    other.post("/api/v1/auth/login", json=ADMIN)
    assert other.get("/api/v1/auth/me").status_code == 200
    client.post(
        "/api/v1/auth/password",
        json={"current_password": ADMIN["password"], "new_password": "newpass123"},
    )
    assert other.get("/api/v1/auth/me").status_code == 401
```

Add to `backend/tests/conftest.py`:

```python
def login(app, username: str, password: str = "secret123") -> TestClient:
    """Cliente nuevo con su propia cookie jar, logueado como `username`."""
    client = TestClient(app)
    resp = client.post(
        "/api/v1/auth/login", json={"username": username, "password": password}
    )
    assert resp.status_code == 200, resp.text
    return client
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_login.py -v`
Expected: FAIL — `POST /api/v1/auth/login` returns 404/405 (endpoint does not exist yet)

- [ ] **Step 3: Write minimal implementation**

Add to `backend/app/routers/auth.py` (extend imports accordingly):

```python
from fastapi import Request

from ..auth import (
    SESSION_COOKIE,
    clear_session_cookie,
    dummy_password_check,
    revoke_other_sessions,
    revoke_session,
    verify_password,
)
from ..schemas.auth import LoginIn, PasswordChangeIn


@router.post("/login", response_model=UserOut)
def login(payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None:
        dummy_password_check(payload.password)
        raise HTTPException(status_code=401, detail="invalid_credentials")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")
    set_session_cookie(response, create_session(db, user))
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        revoke_session(db, token)
    clear_session_cookie(response)


@router.post("/password", status_code=204)
def change_password(
    payload: PasswordChangeIn,
    request: Request,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=403, detail="wrong_password")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    # cambiar la contraseña echa al resto de dispositivos (robo de sesión)
    revoke_other_sessions(db, user.id, request.cookies.get(SESSION_COOKIE))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest -v`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/auth.py backend/tests/
git commit -m "feat: login, logout and password change"
```

---

### Task 7: User settings and admin user management

**Files:**
- Create: `backend/app/routers/users.py`
- Create: `backend/app/routers/admin.py`
- Create: `backend/app/schemas/users.py`
- Modify: `backend/app/main.py` (mount both routers)
- Modify: `backend/tests/conftest.py` (add `make_user` helper)
- Test: `backend/tests/test_users.py`

**Interfaces:**
- Consumes: `CurrentUser`, `AdminUser`, `get_current_user`, `require_admin`, `hash_password`, `revoke_other_sessions`, `UserOut`, `Credentials`.
- Produces: `PATCH /api/v1/users/me` (settings); admin endpoints `GET/POST /api/v1/admin/users`, `PATCH/DELETE /api/v1/admin/users/{user_id}`; schemas `SettingsIn(locale?, units?, timezone?)`, `UserCreateIn(Credentials + is_admin)`, `UserUpdateIn(password?, is_admin?)`; conftest helper `make_user(admin_client, username, *, password="secret123", is_admin=False) -> dict`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_users.py`:

```python
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
```

Add to `backend/tests/conftest.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_users.py -v`
Expected: FAIL — 404 on `/api/v1/users/me` and `/api/v1/admin/users` (routers not mounted)

- [ ] **Step 3: Write minimal implementation**

`backend/app/schemas/users.py`:

```python
from typing import Literal

from pydantic import BaseModel, Field

from .auth import Credentials


class SettingsIn(BaseModel):
    locale: Literal["es", "en"] | None = None
    units: Literal["kg", "lb"] | None = None
    timezone: str | None = Field(None, max_length=50)


class UserCreateIn(Credentials):
    is_admin: bool = False


class UserUpdateIn(BaseModel):
    password: str | None = Field(None, min_length=8, max_length=100)
    is_admin: bool | None = None
```

`backend/app/routers/users.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..schemas.auth import UserOut
from ..schemas.users import SettingsIn

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
def update_settings(payload: SettingsIn, user: CurrentUser, db: Session = Depends(get_db)):
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    return user
```

`backend/app/routers/admin.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import AdminUser, hash_password, revoke_other_sessions
from ..db import get_db
from ..models import User
from ..schemas.auth import UserOut
from ..schemas.users import UserCreateIn, UserUpdateIn

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.username)).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(payload: UserCreateIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status_code=409, detail="username_taken")
    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        is_admin=payload.is_admin,
    )
    db.add(user)
    db.commit()
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int, payload: UserUpdateIn, admin: AdminUser, db: Session = Depends(get_db)
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    if payload.is_admin is False and user.id == admin.id:
        raise HTTPException(status_code=409, detail="cannot_demote_self")
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        # reset por el admin: echa al usuario de todos sus dispositivos
        revoke_other_sessions(db, user.id, None)
    db.commit()
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, admin: AdminUser, db: Session = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(status_code=409, detail="cannot_delete_self")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    db.delete(user)
    db.commit()
```

In `backend/app/main.py`, extend the imports and mount the routers right before the auth router line:

```python
from fastapi import Depends

from .auth import get_current_user, require_admin
from .routers import admin, auth, users

    # protegidos: cualquier usuario con sesión
    app.include_router(
        users.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    # solo admin: gestión de usuarios e invitaciones
    app.include_router(
        admin.router, prefix=API_PREFIX, dependencies=[Depends(require_admin)]
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest -v`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/ backend/tests/
git commit -m "feat: user settings and admin user management"
```

---

### Task 8: Invites

**Files:**
- Modify: `backend/app/auth.py` (add `create_invite`, `resolve_invite`)
- Modify: `backend/app/routers/admin.py` (create/list/delete invites)
- Modify: `backend/app/routers/auth.py` (public redeem endpoint)
- Modify: `backend/app/schemas/users.py` (add `InviteOut`, `RedeemIn`)
- Test: `backend/tests/test_invites.py`

**Interfaces:**
- Consumes: `Invite` model, `_token_hash`, `Credentials`, session helpers.
- Produces: `create_invite(db, admin: User) -> str` (clear token, shown once); `resolve_invite(db, raw_token) -> Invite | None` (valid = exists, unused, unexpired); endpoints `POST /api/v1/admin/invites` → `{"token": ...}`, `GET /api/v1/admin/invites`, `DELETE /api/v1/admin/invites/{invite_id}`, `POST /api/v1/auth/invites/redeem` (public, 201, sets cookie).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_invites.py`:

```python
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app import models


def redeem(app, token: str, username: str = "loki") -> "TestClient":
    fresh = TestClient(app)
    resp = fresh.post(
        "/api/v1/auth/invites/redeem",
        json={"token": token, "username": username, "password": "secret123"},
    )
    fresh.last_redeem = resp  # type: ignore[attr-defined]
    return fresh


def test_invite_full_flow(client: TestClient, app):
    token = client.post("/api/v1/admin/invites").json()["token"]
    fresh = redeem(app, token)
    assert fresh.last_redeem.status_code == 201
    me = fresh.get("/api/v1/auth/me").json()
    assert me["username"] == "loki"
    assert me["is_admin"] is False


def test_invite_single_use(client: TestClient, app):
    token = client.post("/api/v1/admin/invites").json()["token"]
    assert redeem(app, token).last_redeem.status_code == 201
    resp = redeem(app, token, "hela").last_redeem
    assert resp.status_code == 410
    assert resp.json()["detail"] == "invite_invalid"


def test_invalid_and_expired_invites(client: TestClient, app, db_session):
    assert redeem(app, "bogus-token").last_redeem.status_code == 410
    token = client.post("/api/v1/admin/invites").json()["token"]
    invite = db_session.scalar(select(models.Invite))
    invite.expires_at = models.utcnow() - timedelta(seconds=1)
    db_session.commit()
    assert redeem(app, token).last_redeem.status_code == 410


def test_redeem_duplicate_username_keeps_invite(client: TestClient, app):
    token = client.post("/api/v1/admin/invites").json()["token"]
    resp = redeem(app, token, "admin").last_redeem
    assert resp.status_code == 409
    assert resp.json()["detail"] == "username_taken"
    # la invitación no se quema con un intento fallido
    assert redeem(app, token, "loki").last_redeem.status_code == 201


def test_list_and_delete_invites(client: TestClient):
    client.post("/api/v1/admin/invites")
    invites = client.get("/api/v1/admin/invites").json()
    assert len(invites) == 1
    assert "token" not in invites[0]  # el token en claro solo se enseña al crear
    assert client.delete(f"/api/v1/admin/invites/{invites[0]['id']}").status_code == 204
    assert client.get("/api/v1/admin/invites").json() == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_invites.py -v`
Expected: FAIL — 404/405 on `/api/v1/admin/invites` (endpoints do not exist)

- [ ] **Step 3: Write minimal implementation**

Add to `backend/app/auth.py`:

```python
from .models import Invite


def create_invite(db: Session, admin: User) -> str:
    """Invitación de un solo uso; devuelve el token en claro (se enseña una vez)."""
    now = utcnow()
    # barre las caducadas sin usar (las usadas se conservan como histórico)
    db.execute(delete(Invite).where(Invite.expires_at < now, Invite.used_at.is_(None)))
    token = secrets.token_urlsafe(32)
    db.add(
        Invite(
            token_hash=_token_hash(token),
            created_by=admin.id,
            expires_at=now + timedelta(hours=get_settings().invite_ttl_hours),
        )
    )
    db.commit()
    return token


def resolve_invite(db: Session, raw_token: str) -> Invite | None:
    invite = db.scalar(select(Invite).where(Invite.token_hash == _token_hash(raw_token)))
    if invite is None or invite.used_at is not None or invite.expires_at < utcnow():
        return None
    return invite
```

Add to `backend/app/schemas/users.py`:

```python
from datetime import datetime


class InviteOut(BaseModel):
    id: int
    created_at: datetime
    expires_at: datetime
    used_at: datetime | None

    model_config = {"from_attributes": True}


class RedeemIn(Credentials):
    token: str
```

Add to `backend/app/routers/admin.py` (extend imports with `AdminUser`, `create_invite`, `Invite`, `InviteOut`):

```python
@router.post("/invites", status_code=201)
def new_invite(admin: AdminUser, db: Session = Depends(get_db)):
    return {"token": create_invite(db, admin)}


@router.get("/invites", response_model=list[InviteOut])
def list_invites(db: Session = Depends(get_db)):
    return db.scalars(select(Invite).order_by(Invite.created_at.desc())).all()


@router.delete("/invites/{invite_id}", status_code=204)
def delete_invite(invite_id: int, db: Session = Depends(get_db)):
    invite = db.get(Invite, invite_id)
    if invite is None:
        raise HTTPException(status_code=404, detail="invite_not_found")
    db.delete(invite)
    db.commit()
```

Add to `backend/app/routers/auth.py`, with these exact new imports:

```python
from ..auth import resolve_invite
from ..models import utcnow
from ..schemas.users import RedeemIn
```

```python
@router.post("/invites/redeem", response_model=UserOut, status_code=201)
def redeem_invite(payload: RedeemIn, response: Response, db: Session = Depends(get_db)):
    """Alta pública con invitación: valida el token antes de quemarlo."""
    invite = resolve_invite(db, payload.token)
    if invite is None:
        raise HTTPException(status_code=410, detail="invite_invalid")
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status_code=409, detail="username_taken")
    user = User(
        username=payload.username, password_hash=hash_password(payload.password)
    )
    db.add(user)
    db.flush()
    invite.used_by = user.id
    invite.used_at = utcnow()
    db.commit()
    set_session_cookie(response, create_session(db, user))
    return user
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest -v`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/ backend/tests/test_invites.py
git commit -m "feat: single-use invites with public redeem"
```

---

### Task 9: Frontend placeholder

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/vite-env.d.ts`
- Create: `frontend/src/main.ts`
- Create: `frontend/src/App.vue`

**Interfaces:**
- Produces: `npm run dev` (Vite :5173, proxy `/api` → :8000) and `npm run build` (typecheck + `dist/`). Phase 3 replaces the placeholder content; the build contract stays.

Placeholder only: real tokens, guard:tokens and the design system arrive in Phase 3, so the inline styles below are acceptable here and only here.

- [ ] **Step 1: Write the files**

`frontend/package.json`:

```json
{
  "name": "berserk-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.0",
    "typescript": "~5.8.3",
    "vite": "^7.0.0",
    "vue-tsc": "^3.0.0"
  }
}
```

`frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

`frontend/vite.config.ts`:

```typescript
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
})
```

`frontend/index.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>berserk</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`frontend/src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />
```

`frontend/src/main.ts`:

```typescript
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

`frontend/src/App.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'

const apiOk = ref(false)

onMounted(async () => {
  const resp = await fetch('/api/v1/health')
  apiOk.value = resp.ok
})
</script>

<template>
  <main class="placeholder">
    <h1>ᛒ berserk</h1>
    <p>{{ apiOk ? 'API conectada' : 'API no disponible' }}</p>
  </main>
</template>

<style>
/* placeholder de fase 1: los tokens y el design system llegan en fase 3 */
.placeholder {
  min-height: 100dvh;
  display: grid;
  place-content: center;
  text-align: center;
  background: #0b0d10;
  color: #e6edf3;
  font-family: system-ui, sans-serif;
}
</style>
```

- [ ] **Step 2: Install and build**

```bash
cd frontend
npm install --no-audit --no-fund
npm run build
```

Expected: build succeeds, `frontend/dist/index.html` exists.

- [ ] **Step 3: Commit (including `package-lock.json`)**

```bash
git add frontend/
git commit -m "feat: buildable frontend placeholder"
```

---

### Task 10: dev.sh

**Files:**
- Create: `dev.sh` (mode `0755`)

**Interfaces:**
- Consumes: `backend/` (uvicorn on :8000 via `app.asgi:app`), `frontend/` (Vite on :5173).
- Produces: `./dev.sh [back|front] [--open]` — data in `./data`, migrations applied on start, `BK_SERVE_STATIC=0` in dev.

- [ ] **Step 1: Write the script**

`dev.sh`:

```bash
#!/usr/bin/env bash
# Lanza backend (FastAPI :8000) y frontend (Vite :5173) en modo dev con hot reload.
#
#   ./dev.sh           → backend + frontend
#   ./dev.sh back      → solo backend
#   ./dev.sh front     → solo frontend
#   ./dev.sh --open    → además abre el navegador en :5173
#
# Los datos de dev se guardan en ./data (ignorado por git). La app se usa
# desde http://localhost:5173 (Vite proxya /api al backend y recarga en
# caliente; :8000 solo expone la API en dev).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${BK_DATA_DIR:-$ROOT/data}"

MODE="all"
OPEN=0
for arg in "$@"; do
  case "$arg" in
    back | front | all) MODE="$arg" ;;
    --open) OPEN=1 ;;
    *)
      echo "Uso: ./dev.sh [back|front] [--open]" >&2
      exit 1
      ;;
  esac
done

check_migrations() {
  # Aviso (nunca bloquea) si models.py difiere de las migraciones aplicadas.
  if ! BK_DATA_DIR="$DATA_DIR" uv run alembic check >/dev/null 2>&1; then
    echo "⚠ models.py difiere de las migraciones. Genera una con:" >&2
    echo "    cd backend && uv run alembic revision --autogenerate -m 'descripcion'" >&2
  fi
}

start_back() {
  if ! command -v uv >/dev/null 2>&1; then
    echo "✗ uv no encontrado. Instálalo con:" >&2
    echo "    sudo pacman -S uv        # Arch/CachyOS" >&2
    echo "    curl -LsSf https://astral.sh/uv/install.sh | sh   # cualquier distro" >&2
    exit 1
  fi
  cd "$ROOT/backend"
  mkdir -p "$DATA_DIR"
  uv sync
  BK_DATA_DIR="$DATA_DIR" uv run alembic upgrade head
  check_migrations
  # BK_SERVE_STATIC=0: que :8000 no sirva una SPA compilada obsoleta en dev
  BK_DATA_DIR="$DATA_DIR" BK_SERVE_STATIC=0 exec uv run uvicorn app.asgi:app --reload --port 8000
}

start_front() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "✗ npm no encontrado. Instala Node 22+ (https://nodejs.org) para el modo dev del frontend." >&2
    exit 1
  fi
  cd "$ROOT/frontend"
  if [ ! -d node_modules ]; then
    echo "▸ Instalando dependencias del frontend…"
    npm install --no-audit --no-fund
  fi
  if [ "$OPEN" = 1 ]; then
    npm run dev -- --open
  else
    npm run dev
  fi
}

wait_for_back() {
  for _ in $(seq 1 60); do
    if ! kill -0 "$BACK_PID" 2>/dev/null; then
      echo "✗ El backend no arrancó; revisa los mensajes anteriores." >&2
      exit 1
    fi
    if curl -sf http://localhost:8000/api/v1/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "⚠ El backend no responde en :8000 tras 30 s; sigo con el frontend igualmente." >&2
}

case "$MODE" in
  back)
    echo "▸ Backend: http://localhost:8000 (API docs: http://localhost:8000/api/docs)"
    start_back
    ;;
  front)
    echo "▸ Frontend: http://localhost:5173 (proxy /api → :8000)"
    start_front
    ;;
  all)
    start_back &
    BACK_PID=$!
    trap 'kill "$BACK_PID" 2>/dev/null || true' EXIT INT TERM
    wait_for_back
    echo ""
    echo "──────────────────────────────────────────────────"
    echo "  berserk · modo dev (hot reload activo)"
    echo "  App        →  http://localhost:5173   ← usa esta"
    echo "  API docs   →  http://localhost:8000/api/docs"
    echo "──────────────────────────────────────────────────"
    echo ""
    start_front
    ;;
esac
```

- [ ] **Step 2: Verify it boots**

```bash
chmod +x dev.sh
./dev.sh back &
sleep 5
curl -sf http://localhost:8000/api/v1/health
kill %1
```

Expected: `{"status":"ok"}`

- [ ] **Step 3: Commit**

```bash
git add dev.sh
git commit -m "feat: dev.sh with hot reload for both services"
```

---

### Task 11: Docker image and example compose

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `examples/docker-compose.yml`

**Interfaces:**
- Consumes: `backend/` (uv project, alembic), `frontend/` (npm build → `dist/`).
- Produces: single image serving API + SPA on :8000, data in `/data`.

- [ ] **Step 1: Write the files**

`.dockerignore`:

```gitignore
**/node_modules
**/dist
**/.venv
**/__pycache__
**/.pytest_cache
data
.git
```

`Dockerfile`:

```dockerfile
# Stage 1: build del frontend
# --platform=$BUILDPLATFORM: el dist son estáticos (independientes de la arch),
# así el build multi-arch no emula npm/vite bajo QEMU para arm64
FROM --platform=$BUILDPLATFORM node:22-alpine AS webbuild
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Stage 2: runtime
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/
WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 UV_NO_CACHE=1
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./
COPY --from=webbuild /web/dist ./static
ENV PATH="/app/.venv/bin:$PATH"

ENV BK_DATA_DIR=/data
VOLUME /data
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health')" || exit 1

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.asgi:app --host 0.0.0.0 --port 8000"]
```

`examples/docker-compose.yml`:

```yaml
services:
  berserk:
    image: ghcr.io/zurdi15/berserk:latest
    container_name: berserk
    ports:
      - "8000:8000"
    volumes:
      - ./data:/data
    restart: unless-stopped
```

- [ ] **Step 2: Build and smoke-test the image**

```bash
docker build -t berserk:dev .
docker run --rm -d -p 8001:8000 -v "$PWD/data-docker:/data" --name berserk-smoke berserk:dev
sleep 5
curl -sf http://localhost:8001/api/v1/health
curl -sf http://localhost:8001/ | grep -q berserk && echo "SPA ok"
docker rm -f berserk-smoke && rm -rf data-docker
```

Expected: `{"status":"ok"}` and `SPA ok`

- [ ] **Step 3: Commit**

```bash
git add Dockerfile .dockerignore examples/
git commit -m "feat: single-image docker build with example compose"
```

---

### Task 12: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: backend tests (`uv run pytest`), frontend build (`npm ci && npm run build`), `Dockerfile`.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync
      - run: uv run pytest -v

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci --no-audit --no-fund
      - run: npm run build

  docker:
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t berserk:ci .
```

- [ ] **Step 2: Validate the workflow syntax locally**

Run: `docker build -t berserk:ci . >/dev/null && echo ok` (the docker job's command) and visually confirm the YAML parses: `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('.github/workflows/ci.yml').read_text()); print('yaml ok')"`
Expected: `ok` and `yaml ok`

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: backend tests, frontend build and docker image"
```

---

## Phase 1 exit criteria

- `cd backend && uv run pytest` — all green.
- `./dev.sh` boots both services; http://localhost:5173 shows the placeholder with "API conectada"; http://localhost:8000/api/docs works.
- `docker build` + `docker run` serves SPA and API from one container.
- Live user validation: dev.sh stays running so the user can bootstrap the admin account from the API docs and exercise login/invites before closing the phase.
