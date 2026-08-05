from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import BodyEntry
from ..permissions import TargetUser
from ..schemas.body import BodyEntryOut, BodyIn

router = APIRouter(prefix="/body", tags=["body"])


@router.get("", response_model=list[BodyEntryOut])
def list_entries(target: TargetUser, db: Session = Depends(get_db)):
    return db.scalars(
        select(BodyEntry).where(BodyEntry.owner_id == target.id).order_by(BodyEntry.date)
    ).all()


@router.put("/{entry_date}", response_model=BodyEntryOut)
def upsert_entry(
    entry_date: date_type, payload: BodyIn, user: CurrentUser, db: Session = Depends(get_db)
):
    entry = db.scalar(
        select(BodyEntry).where(BodyEntry.owner_id == user.id, BodyEntry.date == entry_date)
    )
    if entry is None:
        entry = BodyEntry(owner_id=user.id, date=entry_date)
        db.add(entry)
    for field, value in payload.model_dump().items():
        setattr(entry, field, value)
    db.commit()
    return entry


@router.delete("/{entry_date}", status_code=204)
def delete_entry(entry_date: date_type, user: CurrentUser, db: Session = Depends(get_db)):
    entry = db.scalar(
        select(BodyEntry).where(BodyEntry.owner_id == user.id, BodyEntry.date == entry_date)
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="not_found")
    db.delete(entry)
    db.commit()
