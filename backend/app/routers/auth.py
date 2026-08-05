from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import (
    SESSION_COOKIE,
    CurrentUser,
    clear_session_cookie,
    create_session,
    dummy_password_check,
    hash_password,
    revoke_other_sessions,
    revoke_session,
    set_session_cookie,
    verify_password,
)
from ..db import get_db
from ..models import User
from ..schemas.auth import Credentials, LoginIn, PasswordChangeIn, StatusOut, UserOut

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
