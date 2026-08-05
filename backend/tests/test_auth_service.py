from datetime import timedelta

from sqlalchemy import select

from app import auth, models


def make_user(db_session) -> models.User:
    user = models.User(username="thor", password_hash=auth.hash_password("secret123"))
    db_session.add(user)
    db_session.commit()
    return user


def test_password_hash_roundtrip():
    hashed = auth.hash_password("secret123")
    assert auth.verify_password("secret123", hashed)
    assert not auth.verify_password("wrong", hashed)


def test_session_roundtrip(db_session):
    user = make_user(db_session)
    token = auth.create_session(db_session, user)
    resolved = auth.resolve_session_user(db_session, token)
    assert resolved is not None and resolved.id == user.id
    assert auth.resolve_session_user(db_session, "bogus") is None


def test_revoke_session(db_session):
    user = make_user(db_session)
    token = auth.create_session(db_session, user)
    auth.revoke_session(db_session, token)
    assert auth.resolve_session_user(db_session, token) is None


def test_expired_session_is_deleted(db_session):
    user = make_user(db_session)
    token = auth.create_session(db_session, user)
    session = db_session.scalar(select(models.AuthSession))
    session.expires_at = models.utcnow() - timedelta(seconds=1)
    db_session.commit()
    assert auth.resolve_session_user(db_session, token) is None
    assert db_session.scalar(select(models.AuthSession)) is None


def test_sliding_renewal_past_half_ttl(db_session):
    user = make_user(db_session)
    token = auth.create_session(db_session, user)
    session = db_session.scalar(select(models.AuthSession))
    # a 1 día de caducar (< ttl/2 = 15 días) debe renovarse a ttl completo
    session.expires_at = models.utcnow() + timedelta(days=1)
    db_session.commit()
    auth.resolve_session_user(db_session, token)
    renewed = db_session.scalar(select(models.AuthSession))
    assert renewed.expires_at > models.utcnow() + timedelta(days=29)


def test_revoke_other_sessions_keeps_current(db_session):
    user = make_user(db_session)
    keep = auth.create_session(db_session, user)
    auth.create_session(db_session, user)
    auth.revoke_other_sessions(db_session, user.id, keep)
    remaining = db_session.scalars(select(models.AuthSession)).all()
    assert len(remaining) == 1
    assert auth.resolve_session_user(db_session, keep) is not None
