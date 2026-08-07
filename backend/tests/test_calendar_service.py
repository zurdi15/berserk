from datetime import date, datetime

from sqlalchemy import event

from app import models
from app.services.calendar import shared_calendar_users


def _finished_workout(db_session, owner_id: int, day: date) -> models.Workout:
    # terminado: ended_at no nulo, criterio del servicio para contar el día
    workout = models.Workout(
        owner_id=owner_id, date=day, ended_at=datetime.combine(day, datetime.min.time())
    )
    db_session.add(workout)
    db_session.commit()
    return workout


def test_includes_grantor_days_with_their_color(db_session):
    me = models.User(username="me", password_hash="x")
    grantor = models.User(username="freyja", password_hash="x", color="#3b82f6")
    db_session.add_all([me, grantor])
    db_session.flush()
    db_session.add(models.ShareGrant(owner_id=grantor.id, viewer_id=me.id))
    db_session.commit()
    _finished_workout(db_session, grantor.id, date(2026, 8, 5))

    result = shared_calendar_users(db_session, me.id, date(2026, 8, 1), date(2026, 8, 31))
    assert len(result) == 1
    assert result[0].user_id == grantor.id
    assert result[0].username == "freyja"
    assert result[0].color == "#3b82f6"
    assert result[0].dates == [date(2026, 8, 5)]


def test_no_grantors_returns_empty(db_session):
    me = models.User(username="me", password_hash="x")
    db_session.add(me)
    db_session.commit()
    assert shared_calendar_users(db_session, me.id, date(2026, 8, 1), date(2026, 8, 31)) == []


def test_no_leak_when_i_am_the_grantor_not_the_viewer(db_session):
    """el grant es unidireccional (mismo criterio que resolve_target_user,
    ver test_sharing.py::test_resolve_target_user): que YO le dé acceso a
    alguien no significa que ellos me lo den a mí."""
    me = models.User(username="me", password_hash="x")
    stranger = models.User(username="loki", password_hash="x")
    db_session.add_all([me, stranger])
    db_session.flush()
    db_session.add(models.ShareGrant(owner_id=me.id, viewer_id=stranger.id))
    db_session.commit()
    _finished_workout(db_session, stranger.id, date(2026, 8, 5))

    assert shared_calendar_users(db_session, me.id, date(2026, 8, 1), date(2026, 8, 31)) == []


def test_revocation_removes_the_grantor(db_session):
    me = models.User(username="me", password_hash="x")
    grantor = models.User(username="freyja", password_hash="x")
    db_session.add_all([me, grantor])
    db_session.flush()
    grant = models.ShareGrant(owner_id=grantor.id, viewer_id=me.id)
    db_session.add(grant)
    db_session.commit()
    _finished_workout(db_session, grantor.id, date(2026, 8, 5))

    before = shared_calendar_users(db_session, me.id, date(2026, 8, 1), date(2026, 8, 31))
    assert len(before) == 1

    db_session.delete(grant)
    db_session.commit()
    assert shared_calendar_users(db_session, me.id, date(2026, 8, 1), date(2026, 8, 31)) == []


def test_excludes_a_workout_still_in_progress(db_session):
    me = models.User(username="me", password_hash="x")
    grantor = models.User(username="freyja", password_hash="x")
    db_session.add_all([me, grantor])
    db_session.flush()
    db_session.add(models.ShareGrant(owner_id=grantor.id, viewer_id=me.id))
    # activo (sin ended_at): no cuenta como "terminado" para el overlay
    db_session.add(models.Workout(owner_id=grantor.id, date=date(2026, 8, 5)))
    db_session.commit()

    result = shared_calendar_users(db_session, me.id, date(2026, 8, 1), date(2026, 8, 31))
    assert len(result) == 1
    assert result[0].dates == []


def test_excludes_workouts_outside_the_month_range(db_session):
    me = models.User(username="me", password_hash="x")
    grantor = models.User(username="freyja", password_hash="x")
    db_session.add_all([me, grantor])
    db_session.flush()
    db_session.add(models.ShareGrant(owner_id=grantor.id, viewer_id=me.id))
    db_session.commit()
    _finished_workout(db_session, grantor.id, date(2026, 7, 31))
    _finished_workout(db_session, grantor.id, date(2026, 8, 15))
    _finished_workout(db_session, grantor.id, date(2026, 9, 1))

    result = shared_calendar_users(db_session, me.id, date(2026, 8, 1), date(2026, 8, 31))
    assert result[0].dates == [date(2026, 8, 15)]


def test_multiple_grantors_ordered_by_username(db_session):
    me = models.User(username="me", password_hash="x")
    zed = models.User(username="zed", password_hash="x")
    ana = models.User(username="ana", password_hash="x")
    db_session.add_all([me, zed, ana])
    db_session.flush()
    db_session.add_all(
        [
            models.ShareGrant(owner_id=zed.id, viewer_id=me.id),
            models.ShareGrant(owner_id=ana.id, viewer_id=me.id),
        ]
    )
    db_session.commit()

    result = shared_calendar_users(db_session, me.id, date(2026, 8, 1), date(2026, 8, 31))
    assert [u.username for u in result] == ["ana", "zed"]


def test_one_grouped_query_regardless_of_grantor_count(db_session, engine):
    """performance: un solo query agrupado para las fechas de TODOS los
    grantors, no un query por usuario dentro de un bucle (N+1). 5 grantors
    con un entreno cada uno deben resolverse con exactamente 2 SELECTs: uno
    para grants+usuarios, otro (agrupado) para las fechas."""
    me = models.User(username="me", password_hash="x")
    grantors = [models.User(username=f"g{i}", password_hash="x") for i in range(5)]
    db_session.add_all([me, *grantors])
    db_session.flush()
    for g in grantors:
        db_session.add(models.ShareGrant(owner_id=g.id, viewer_id=me.id))
    db_session.commit()
    for g in grantors:
        _finished_workout(db_session, g.id, date(2026, 8, 5))

    statements: list[str] = []

    def _capture(conn, cursor, statement, *args, **kwargs):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        result = shared_calendar_users(db_session, me.id, date(2026, 8, 1), date(2026, 8, 31))
    finally:
        event.remove(engine, "before_cursor_execute", _capture)

    assert len(result) == 5
    select_statements = [s for s in statements if s.strip().upper().startswith("SELECT")]
    assert len(select_statements) == 2, select_statements
