from datetime import date

from sqlalchemy import select, text

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


def add_workout_exercise(db_session, workout_id, exercise_id, position=1):
    wex = models.WorkoutExercise(workout_id=workout_id, exercise_id=exercise_id, position=position)
    db_session.add(wex)
    db_session.flush()
    return wex


def test_sync_derives_only_primary_groups(db_session):
    # fix M9 (revisión): sync_derived_muscle_groups ya no recibe exercise_ids
    # a mano — lee workout_exercises ella misma (ver services/workouts.py),
    # así que la prueba tiene que insertar la fila de verdad primero
    _, workout, chest, _, triceps, bench, _ = setup_catalog(db_session)
    add_workout_exercise(db_session, workout.id, bench.id)
    sync_derived_muscle_groups(db_session, workout.id)
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
    add_workout_exercise(db_session, workout.id, bench.id)
    add_workout_exercise(db_session, workout.id, squat.id, position=2)
    sync_derived_muscle_groups(db_session, workout.id)
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
    add_workout_exercise(db_session, workout.id, bench.id)
    # tag "manual" preexistente que no corresponde a ningún ejercicio actual
    db_session.add(models.WorkoutMuscleGroup(workout_id=workout.id, muscle_group_id=legs.id))
    db_session.commit()

    sync_derived_muscle_groups(db_session, workout.id)
    db_session.commit()

    tags = db_session.scalars(
        select(models.WorkoutMuscleGroup.muscle_group_id).where(
            models.WorkoutMuscleGroup.workout_id == workout.id
        )
    ).all()
    assert tags == [chest.id]


def test_sync_with_no_exercises_clears_all_tags(db_session):
    _, workout, chest, _, _, bench, _ = setup_catalog(db_session)
    wex = add_workout_exercise(db_session, workout.id, bench.id)
    sync_derived_muscle_groups(db_session, workout.id)
    db_session.commit()

    # simula la baja del ejercicio: sin WorkoutExercise, no hay nada que derivar
    db_session.delete(wex)
    db_session.flush()
    sync_derived_muscle_groups(db_session, workout.id)
    db_session.commit()

    tags = db_session.scalars(
        select(models.WorkoutMuscleGroup.muscle_group_id).where(
            models.WorkoutMuscleGroup.workout_id == workout.id
        )
    ).all()
    assert tags == []


def test_sync_never_commits(db_session):
    _, workout, _, _, _, bench, _ = setup_catalog(db_session)
    add_workout_exercise(db_session, workout.id, bench.id)
    sync_derived_muscle_groups(db_session, workout.id)
    db_session.rollback()
    assert db_session.scalars(select(models.WorkoutMuscleGroup)).all() == []


# Fix I3 (revisión): sync_derived_muscle_groups solo corre a partir de esta
# ronda (start-from-routine/add_exercise/remove_exercise); un workout que ya
# existiera antes se queda con workout_muscle_groups vacío (o con tags
# manuales del editor ya retirado) para siempre, salvo el backfill de la
# migración 4d8d5ec665aa. Esta prueba ejecuta el MISMO SQL que esa
# migración (DELETE + INSERT...SELECT DISTINCT) contra la base de test, para
# probar la lógica sin necesitar un runner de alembic en el harness de
# pytest — si esa migración cambia alguna vez, este SQL debe cambiar con ella.
BACKFILL_SQL = (
    "DELETE FROM workout_muscle_groups",
    """
    INSERT INTO workout_muscle_groups (workout_id, muscle_group_id)
    SELECT DISTINCT we.workout_id, emg.muscle_group_id
    FROM workout_exercises we
    JOIN exercise_muscle_groups emg
      ON emg.exercise_id = we.exercise_id
     AND emg.is_primary = 1
    """,
)


def test_backfill_migration_sql_derives_groups_for_a_pre_existing_workout(db_session):
    """Un workout "de antes" del feature: tiene WorkoutExercise pero JAMÁS
    pasó por sync_derived_muscle_groups, así que workout_muscle_groups está
    vacío para él — exactamente la situación real que motiva el backfill."""
    _, workout, chest, _, _, bench, _ = setup_catalog(db_session)
    wex = models.WorkoutExercise(workout_id=workout.id, exercise_id=bench.id, position=1)
    db_session.add(wex)
    db_session.commit()

    assert db_session.scalars(select(models.WorkoutMuscleGroup)).all() == []

    for statement in BACKFILL_SQL:
        db_session.execute(text(statement))
    db_session.commit()

    tags = db_session.scalars(
        select(models.WorkoutMuscleGroup.muscle_group_id).where(
            models.WorkoutMuscleGroup.workout_id == workout.id
        )
    ).all()
    assert tags == [chest.id]


def test_backfill_migration_sql_replaces_stale_manual_tags_too(db_session):
    """Un workout con un tag MANUAL viejo (del editor que este lane retiró)
    que ya no corresponde a ningún ejercicio actual: el backfill lo limpia,
    no lo conserva junto al derivado."""
    _, workout, chest, legs, _, bench, _ = setup_catalog(db_session)
    wex = models.WorkoutExercise(workout_id=workout.id, exercise_id=bench.id, position=1)
    db_session.add(wex)
    db_session.add(models.WorkoutMuscleGroup(workout_id=workout.id, muscle_group_id=legs.id))
    db_session.commit()

    for statement in BACKFILL_SQL:
        db_session.execute(text(statement))
    db_session.commit()

    tags = db_session.scalars(
        select(models.WorkoutMuscleGroup.muscle_group_id).where(
            models.WorkoutMuscleGroup.workout_id == workout.id
        )
    ).all()
    assert tags == [chest.id]
    assert legs.id not in tags


def test_backfill_migration_sql_is_global_across_every_workout(db_session):
    """El backfill no es fila-a-fila: un solo DELETE+INSERT cubre TODOS los
    workouts de TODOS los usuarios de una sentada (así corre en una base con
    años de historial sin iterar en Python)."""
    user2 = models.User(username="loki", password_hash="x")
    db_session.add(user2)
    db_session.flush()
    _, workout_a, chest, legs, _, bench, squat = setup_catalog(db_session)
    workout_b = models.Workout(owner_id=user2.id, date=date(2026, 8, 6))
    db_session.add(workout_b)
    db_session.flush()
    db_session.add_all([
        models.WorkoutExercise(workout_id=workout_a.id, exercise_id=bench.id, position=1),
        models.WorkoutExercise(workout_id=workout_b.id, exercise_id=squat.id, position=1),
    ])
    db_session.commit()

    for statement in BACKFILL_SQL:
        db_session.execute(text(statement))
    db_session.commit()

    tags_a = db_session.scalars(
        select(models.WorkoutMuscleGroup.muscle_group_id).where(
            models.WorkoutMuscleGroup.workout_id == workout_a.id
        )
    ).all()
    tags_b = db_session.scalars(
        select(models.WorkoutMuscleGroup.muscle_group_id).where(
            models.WorkoutMuscleGroup.workout_id == workout_b.id
        )
    ).all()
    assert tags_a == [chest.id]
    assert tags_b == [legs.id]
