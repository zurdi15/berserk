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
