from datetime import date

from sqlalchemy import select

from app import models
from app.services.workouts import sync_derived_muscle_groups


def setup_catalog(db_session):
    user = models.User(username="thor", password_hash="x")
    chest = models.MuscleGroup(slug="chest", name_es="Pecho", name_en="Chest")
    legs = models.MuscleGroup(slug="legs", name_es="Piernas", name_en="Legs")
    triceps = models.MuscleGroup(slug="triceps", name_es="Tríceps", name_en="Triceps")
    bench = models.Exercise(name_es="Press", name_en="Bench", measurement="strength")
    squat = models.Exercise(name_es="Sentadilla", name_en="Squat", measurement="strength")
    db_session.add_all([user, chest, legs, triceps, bench, squat])
    db_session.flush()
    db_session.add_all([
        models.ExerciseMuscleGroup(exercise_id=bench.id, muscle_group_id=chest.id, is_primary=True),
        models.ExerciseMuscleGroup(exercise_id=bench.id, muscle_group_id=triceps.id, is_primary=False),
        models.ExerciseMuscleGroup(exercise_id=squat.id, muscle_group_id=legs.id, is_primary=True),
    ])
    workout = models.Workout(owner_id=user.id, date=date(2026, 8, 5))
    db_session.add(workout)
    db_session.commit()
    return user, workout, chest, legs, triceps, bench, squat


def test_sync_derives_only_primary_groups(db_session):
    _, workout, chest, _, triceps, bench, _ = setup_catalog(db_session)
    sync_derived_muscle_groups(db_session, workout.id, [bench.id])
    db_session.commit()
    tags = db_session.scalars(
        select(models.WorkoutMuscleGroup.muscle_group_id).where(
            models.WorkoutMuscleGroup.workout_id == workout.id
        )
    ).all()
    # secundario (triceps) queda fuera: solo se derivan grupos PRIMARIOS
    assert tags == [chest.id]
    assert triceps.id not in tags


def test_sync_unions_groups_across_exercises_and_dedupes(db_session):
    _, workout, chest, legs, _, bench, squat = setup_catalog(db_session)
    sync_derived_muscle_groups(db_session, workout.id, [bench.id, squat.id])
    db_session.commit()
    tags = set(
        db_session.scalars(
            select(models.WorkoutMuscleGroup.muscle_group_id).where(
                models.WorkoutMuscleGroup.workout_id == workout.id
            )
        ).all()
    )
    assert tags == {chest.id, legs.id}


def test_sync_replaces_previous_rows_including_manual_ones(db_session):
    _, workout, chest, legs, _, bench, _ = setup_catalog(db_session)
    # tag "manual" preexistente que no corresponde a ningún ejercicio actual
    db_session.add(models.WorkoutMuscleGroup(workout_id=workout.id, muscle_group_id=legs.id))
    db_session.commit()

    sync_derived_muscle_groups(db_session, workout.id, [bench.id])
    db_session.commit()

    tags = db_session.scalars(
        select(models.WorkoutMuscleGroup.muscle_group_id).where(
            models.WorkoutMuscleGroup.workout_id == workout.id
        )
    ).all()
    assert tags == [chest.id]


def test_sync_with_no_exercises_clears_all_tags(db_session):
    _, workout, chest, _, _, bench, _ = setup_catalog(db_session)
    sync_derived_muscle_groups(db_session, workout.id, [bench.id])
    db_session.commit()

    sync_derived_muscle_groups(db_session, workout.id, [])
    db_session.commit()

    tags = db_session.scalars(
        select(models.WorkoutMuscleGroup.muscle_group_id).where(
            models.WorkoutMuscleGroup.workout_id == workout.id
        )
    ).all()
    assert tags == []


def test_sync_never_commits(db_session):
    _, workout, _, _, _, bench, _ = setup_catalog(db_session)
    sync_derived_muscle_groups(db_session, workout.id, [bench.id])
    db_session.rollback()
    assert db_session.scalars(select(models.WorkoutMuscleGroup)).all() == []
