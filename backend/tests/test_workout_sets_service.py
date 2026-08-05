from datetime import date

import pytest
from sqlalchemy import select

from app import models
from app.services import workout_sets as svc


def setup_workout(db_session, measurement="strength"):
    user = models.User(username="thor", password_hash="x")
    exercise = models.Exercise(name_es="Press", name_en="Press", measurement=measurement)
    db_session.add_all([user, exercise])
    db_session.flush()
    workout = models.Workout(owner_id=user.id, date=date(2026, 8, 5))
    db_session.add(workout)
    db_session.flush()
    wex = models.WorkoutExercise(workout_id=workout.id, exercise_id=exercise.id, position=1)
    db_session.add(wex)
    db_session.commit()
    return user, exercise, workout, wex


def add_set(db_session, wex, n, **fields) -> models.WorkoutSet:
    wset = models.WorkoutSet(workout_exercise_id=wex.id, set_number=n, **fields)
    db_session.add(wset)
    db_session.flush()
    return wset


def test_estimate_1rm_epley():
    assert svc.estimate_1rm(100, 1) == 100
    assert svc.estimate_1rm(100, 5) == pytest.approx(116.67, abs=0.01)
    assert svc.estimate_1rm(80, 10) == pytest.approx(106.67, abs=0.01)


def test_validate_set_fields_matrix():
    svc.validate_set_fields("strength", {"reps": 5, "weight_kg": 100})
    svc.validate_set_fields("bodyweight", {"reps": 10})
    svc.validate_set_fields("bodyweight", {"reps": 10, "weight_kg": 20})
    svc.validate_set_fields("timed", {"duration_seconds": 60})
    svc.validate_set_fields("cardio", {"duration_seconds": 1800, "distance_m": 5000})
    with pytest.raises(ValueError):
        svc.validate_set_fields("strength", {"reps": 5})            # falta peso
    with pytest.raises(ValueError):
        svc.validate_set_fields("timed", {"duration_seconds": 60, "reps": 10})  # sobra reps
    with pytest.raises(ValueError):
        svc.validate_set_fields("cardio", {"distance_m": 5000})     # falta duración
    with pytest.raises(ValueError):
        svc.validate_set_fields("strength", {"reps": 5, "weight_kg": 100, "distance_m": 1})


def test_first_set_creates_baseline_prs(db_session):
    user, exercise, workout, wex = setup_workout(db_session)
    wset = add_set(db_session, wex, 1, reps=5, weight_kg=100)
    volume = svc.session_volume(db_session, workout.id, exercise.id)
    assert volume == 500
    records = svc.detect_prs(db_session, user.id, exercise, wset, volume)
    assert {r.kind for r in records} == {"max_weight", "est_1rm", "max_volume"}


def test_only_beaten_kinds_create_records(db_session):
    user, exercise, workout, wex = setup_workout(db_session)
    first = add_set(db_session, wex, 1, reps=5, weight_kg=100)
    svc.detect_prs(db_session, user.id, exercise, first,
                   svc.session_volume(db_session, workout.id, exercise.id))
    # menos peso pero más volumen acumulado de sesión
    second = add_set(db_session, wex, 2, reps=10, weight_kg=80)
    records = svc.detect_prs(db_session, user.id, exercise, second,
                             svc.session_volume(db_session, workout.id, exercise.id))
    kinds = {r.kind for r in records}
    assert "max_volume" in kinds            # 500 -> 1300
    assert "max_weight" not in kinds        # 80 < 100
    assert "est_1rm" not in kinds           # 106.67 < 116.67


def test_warmup_and_non_strength_ignored(db_session):
    user, exercise, workout, wex = setup_workout(db_session)
    warmup = add_set(db_session, wex, 1, reps=10, weight_kg=40, is_warmup=True)
    assert svc.detect_prs(db_session, user.id, exercise, warmup,
                          svc.session_volume(db_session, workout.id, exercise.id)) == []
    assert svc.session_volume(db_session, workout.id, exercise.id) == 0  # warmup no computa

    user2 = models.User(username="loki", password_hash="x")
    cardio = models.Exercise(name_es="Cinta", name_en="Treadmill", measurement="cardio")
    db_session.add_all([user2, cardio])
    db_session.flush()
    workout2 = models.Workout(owner_id=user2.id, date=date(2026, 8, 5))
    db_session.add(workout2)
    db_session.flush()
    wex2 = models.WorkoutExercise(workout_id=workout2.id, exercise_id=cardio.id, position=1)
    db_session.add(wex2)
    db_session.flush()
    cardio_set = add_set(db_session, wex2, 1, duration_seconds=1800)
    assert svc.detect_prs(db_session, user2.id, cardio, cardio_set, 0) == []


def test_detect_prs_never_commits(db_session):
    user, exercise, workout, wex = setup_workout(db_session)
    wset = add_set(db_session, wex, 1, reps=5, weight_kg=100)
    svc.detect_prs(db_session, user.id, exercise, wset,
                   svc.session_volume(db_session, workout.id, exercise.id))
    db_session.rollback()
    assert db_session.scalars(select(models.PersonalRecord)).all() == []
