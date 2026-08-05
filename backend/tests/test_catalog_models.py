import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app import models


def make_user_row(db_session, username="thor") -> models.User:
    user = models.User(username=username, password_hash="x")
    db_session.add(user)
    db_session.commit()
    return user


def test_global_and_custom_muscle_groups(db_session):
    user = make_user_row(db_session)
    db_session.add(models.MuscleGroup(slug="chest", name_es="Pecho", name_en="Chest"))
    db_session.add(
        models.MuscleGroup(slug="glutes", name_es="Glúteos", name_en="Glutes", owner_id=user.id)
    )
    db_session.commit()
    global_groups = db_session.scalars(
        select(models.MuscleGroup).where(models.MuscleGroup.owner_id.is_(None))
    ).all()
    assert [g.slug for g in global_groups] == ["chest"]


def test_exercise_muscle_links(db_session):
    chest = models.MuscleGroup(slug="chest", name_es="Pecho", name_en="Chest")
    triceps = models.MuscleGroup(slug="triceps", name_es="Tríceps", name_en="Triceps")
    bench = models.Exercise(name_es="Press banca", name_en="Bench press", measurement="strength")
    db_session.add_all([chest, triceps, bench])
    db_session.flush()
    db_session.add_all([
        models.ExerciseMuscleGroup(exercise_id=bench.id, muscle_group_id=chest.id, is_primary=True),
        models.ExerciseMuscleGroup(exercise_id=bench.id, muscle_group_id=triceps.id, is_primary=False),
    ])
    db_session.commit()
    assert {(l.muscle_group_id, l.is_primary) for l in bench.muscle_links} == {
        (chest.id, True),
        (triceps.id, False),
    }
    db_session.delete(bench)
    db_session.commit()
    assert db_session.scalar(select(models.ExerciseMuscleGroup)) is None


def test_share_grant_unique_pair(db_session):
    thor = make_user_row(db_session, "thor")
    freyja = make_user_row(db_session, "freyja")
    db_session.add(models.ShareGrant(owner_id=thor.id, viewer_id=freyja.id))
    db_session.commit()
    db_session.add(models.ShareGrant(owner_id=thor.id, viewer_id=freyja.id))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
    db_session.delete(freyja)
    db_session.commit()
    assert db_session.scalar(select(models.ShareGrant)) is None  # cae con el viewer
