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
