from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import User
from ..schemas.auth import UserOut
from ..schemas.users import SettingsIn, UserDirectoryOut

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
def update_settings(payload: SettingsIn, user: CurrentUser, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude_unset=True)
    # locale, units y timezone no son anulables: un null explícito se ignora
    for field in ("locale", "units", "timezone"):
        if field in data and data[field] is None:
            del data[field]
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    return user


@router.get("/directory", response_model=list[UserDirectoryOut])
def list_directory(user: CurrentUser, db: Session = Depends(get_db)):
    """item 11: picker de "conceder acceso" — una instancia self-hosted
    pequeña no necesita ocultar quién más existe (a diferencia de sharing,
    que sí exige un grant previo para leer datos), así que esto NO es
    admin-only, solo autenticado. Se excluye a uno mismo (no tiene sentido
    concederse acceso) y NUNCA se filtra is_admin/locale/timezone."""
    users = db.scalars(
        select(User).where(User.id != user.id).order_by(User.username)
    ).all()
    return users
