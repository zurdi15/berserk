from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app import models


def make_user_row(db_session, username="thor") -> models.User:
    user = models.User(username=username, password_hash="x")
    db_session.add(user)
    db_session.commit()
    return user


def make_exercise(db_session) -> models.Exercise:
    exercise = models.Exercise(name_es="Press", name_en="Press", measurement="strength")
    db_session.add(exercise)
    db_session.commit()
    return exercise


def test_routine_cascade(db_session):
    user = make_user_row(db_session)
    exercise = make_exercise(db_session)
    routine = models.Routine(owner_id=user.id, name="Push A")
    db_session.add(routine)
    db_session.flush()
    db_session.add(
        models.RoutineExercise(routine_id=routine.id, exercise_id=exercise.id, position=1)
    )
    db_session.commit()
    db_session.delete(routine)
    db_session.commit()
    assert db_session.scalar(select(models.RoutineExercise)) is None


def test_workout_chain_cascade(db_session):
    user = make_user_row(db_session)
    exercise = make_exercise(db_session)
    workout = models.Workout(owner_id=user.id, date=date(2026, 8, 5))
    db_session.add(workout)
    db_session.flush()
    wex = models.WorkoutExercise(workout_id=workout.id, exercise_id=exercise.id, position=1)
    db_session.add(wex)
    db_session.flush()
    wset = models.WorkoutSet(workout_exercise_id=wex.id, set_number=1, reps=5, weight_kg=100)
    db_session.add(wset)
    db_session.flush()
    db_session.add(
        models.PersonalRecord(
            owner_id=user.id, exercise_id=exercise.id, kind="max_weight", value=100, set_id=wset.id
        )
    )
    db_session.commit()
    db_session.delete(workout)
    db_session.commit()
    assert db_session.scalar(select(models.WorkoutSet)) is None
    # el PR sobrevive con set_id anulado (histórico); el borrado explícito llega en el router
    record = db_session.scalar(select(models.PersonalRecord))
    assert record is not None and record.set_id is None


def test_body_entry_unique_per_day(db_session):
    user = make_user_row(db_session)
    db_session.add(models.BodyEntry(owner_id=user.id, date=date(2026, 8, 5), weight_kg=80))
    db_session.commit()
    db_session.add(models.BodyEntry(owner_id=user.id, date=date(2026, 8, 5), weight_kg=81))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_scheduled_session_defaults(db_session):
    user = make_user_row(db_session)
    session = models.ScheduledSession(owner_id=user.id, date=date(2026, 8, 7))
    db_session.add(session)
    db_session.commit()
    assert session.status == "planned"
    assert session.workout_id is None
