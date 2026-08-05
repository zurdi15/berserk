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
