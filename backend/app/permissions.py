"""Resolución del usuario objetivo para lecturas compartidas.

Solo se usa en GETs: las mutaciones usan CurrentUser y no aceptan user_id,
así que escribir datos ajenos es estructuralmente imposible. Sin grant se
responde 404 (nunca 403) para no filtrar qué usuarios existen.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import get_current_user
from .db import get_db
from .models import ShareGrant, User


def resolve_target_user(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    user_id: int | None = Query(default=None),
) -> User:
    if user_id is None or user_id == user.id:
        return user
    grant = db.scalar(
        select(ShareGrant).where(
            ShareGrant.owner_id == user_id, ShareGrant.viewer_id == user.id
        )
    )
    target = db.get(User, user_id) if grant else None
    if target is None:
        raise HTTPException(status_code=404, detail="not_found")
    return target


TargetUser = Annotated[User, Depends(resolve_target_user)]
