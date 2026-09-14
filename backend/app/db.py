from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(db_url: str) -> Engine:
    # v0.40.0: el pool por defecto (5+10) se quedaba corto frente al threadpool
    # de 40 hilos con el que Starlette corre los handlers síncronos — bajo una
    # ráfaga (la biblioteca pidiendo ~60 imágenes) las peticiones del entreno
    # esperaban conexión. Con WAL las conexiones SQLite son baratas: una por
    # hilo posible y nadie hace cola.
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
        pool_size=10,
        max_overflow=30,
    )

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
