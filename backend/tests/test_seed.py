from sqlalchemy import func, select

from app import models
from app.seed import SEED_EXERCISES, ensure_catalog


def count_global(db, model):
    return db.scalar(select(func.count(model.id)).where(model.owner_id.is_(None)))


def test_seed_populates_and_is_idempotent(db_session):
    ensure_catalog(db_session)
    groups = count_global(db_session, models.MuscleGroup)
    exercises = count_global(db_session, models.Exercise)
    assert groups == 8
    assert exercises == len(SEED_EXERCISES) >= 40
    ensure_catalog(db_session)  # segunda pasada: no duplica
    assert count_global(db_session, models.MuscleGroup) == groups
    assert count_global(db_session, models.Exercise) == exercises


def test_every_exercise_has_exactly_one_primary_group(db_session):
    ensure_catalog(db_session)
    exercises = db_session.scalars(select(models.Exercise)).all()
    for exercise in exercises:
        primaries = [l for l in exercise.muscle_links if l.is_primary]
        assert len(primaries) == 1, exercise.name_en
        assert exercise.measurement in models.MEASUREMENTS


def test_app_startup_seeds(app, db_session):
    # create_app corre el seed con su propio sessionmaker sobre el mismo engine
    assert count_global(db_session, models.MuscleGroup) == 8
