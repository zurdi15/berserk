from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..schemas.auth import UserOut
from ..schemas.users import SettingsIn

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
