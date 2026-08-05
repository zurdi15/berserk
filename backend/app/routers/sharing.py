from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import ShareGrant, User
from ..schemas.auth import UserOut
from ..schemas.users import GrantIn, SharingOut

router = APIRouter(prefix="/sharing", tags=["sharing"])


@router.get("", response_model=SharingOut)
def list_grants(user: CurrentUser, db: Session = Depends(get_db)):
    given = db.scalars(
        select(User).join(ShareGrant, ShareGrant.viewer_id == User.id)
        .where(ShareGrant.owner_id == user.id).order_by(User.username)
    ).all()
    received = db.scalars(
        select(User).join(ShareGrant, ShareGrant.owner_id == User.id)
        .where(ShareGrant.viewer_id == user.id).order_by(User.username)
    ).all()
    return SharingOut(given=given, received=received)


@router.post("", response_model=UserOut, status_code=201)
def grant(payload: GrantIn, user: CurrentUser, db: Session = Depends(get_db)):
    viewer = db.scalar(select(User).where(User.username == payload.username))
    if viewer is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    if viewer.id == user.id:
        raise HTTPException(status_code=409, detail="cannot_share_self")
    exists = db.scalar(
        select(ShareGrant).where(
            ShareGrant.owner_id == user.id, ShareGrant.viewer_id == viewer.id
        )
    )
    if exists:
        raise HTTPException(status_code=409, detail="already_shared")
    db.add(ShareGrant(owner_id=user.id, viewer_id=viewer.id))
    try:
        db.commit()
    except IntegrityError:
        # dos POST idénticos en paralelo: la unique constraint es el árbitro
        db.rollback()
        raise HTTPException(status_code=409, detail="already_shared") from None
    return viewer


@router.delete("/{viewer_id}", status_code=204)
def revoke(viewer_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    grant_row = db.scalar(
        select(ShareGrant).where(
            ShareGrant.owner_id == user.id, ShareGrant.viewer_id == viewer_id
        )
    )
    if grant_row is None:
        raise HTTPException(status_code=404, detail="grant_not_found")
    db.delete(grant_row)
    db.commit()
