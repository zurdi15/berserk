from datetime import date, datetime

from sqlalchemy import select

from app import models
from app.services import progress as svc


def seed_user_with_workouts(db_session):
    user = models.User(username="thor", password_hash="x")
    chest = models.MuscleGroup(slug="chest", name_es="Pecho", name_en="Chest")
    bench = models.Exercise(name_es="Press", name_en="Bench", measurement="strength")
    db_session.add_all([user, chest, bench])
    db_session.flush()
    db_session.add(
        models.ExerciseMuscleGroup(
            exercise_id=bench.id, muscle_group_id=chest.id, is_primary=True
        )
    )
    days_and_sets = [
        (date(2026, 7, 27), [(5, 100), (5, 100)]),   # lunes semana 31
        (date(2026, 8, 3), [(5, 105)]),              # lunes semana 32
    ]
    for day, sets in days_and_sets:
        # terminados: el índice único parcial de workouts activos no admite
        # dos entrenos abiertos (ended_at NULL) a la vez para el mismo dueño
        workout = models.Workout(
            owner_id=user.id, date=day, ended_at=datetime.combine(day, datetime.min.time())
        )
        db_session.add(workout)
        db_session.flush()
        wex = models.WorkoutExercise(workout_id=workout.id, exercise_id=bench.id, position=1)
        db_session.add(wex)
        db_session.flush()
        for n, (reps, weight) in enumerate(sets, start=1):
            db_session.add(
                models.WorkoutSet(
                    workout_exercise_id=wex.id, set_number=n, reps=reps, weight_kg=weight
                )
            )
    db_session.commit()
    return user, chest, bench


def test_exercise_series(db_session):
    user, _, bench = seed_user_with_workouts(db_session)
    series = svc.exercise_series(db_session, user.id, bench.id)
    assert [s["date"] for s in series] == [date(2026, 7, 27), date(2026, 8, 3)]
    assert series[0]["top_weight"] == 100
    assert series[0]["volume"] == 1000
    assert series[1]["est_1rm"] == 122.5  # 105 * (1 + 5/30)


def test_weekly_streak():
    trained = [date(2026, 7, 27), date(2026, 8, 3)]          # semanas 31 y 32
    assert svc.weekly_streak(trained, today=date(2026, 8, 5)) == 2   # en semana 32
    assert svc.weekly_streak(trained, today=date(2026, 8, 12)) == 2  # semana 33 sin entrenar aún: no rompe
    assert svc.weekly_streak(trained, today=date(2026, 8, 19)) == 0  # semana 34: racha muerta
    assert svc.weekly_streak([], today=date(2026, 8, 5)) == 0


def test_longest_streak_weeks():
    # dos rachas en el histórico: 3 semanas consecutivas (28-30) y, tras un
    # hueco (31-32 sin entrenar), 2 semanas más (33-34) — el máximo es 3, no
    # la racha más reciente (esa es cosa de weekly_streak, no de esta función)
    trained = [
        date(2026, 7, 6), date(2026, 7, 13), date(2026, 7, 20),   # semanas 28, 29, 30
        date(2026, 8, 10), date(2026, 8, 17),                     # semanas 33, 34
    ]
    assert svc.longest_streak_weeks(trained) == 3
    assert svc.longest_streak_weeks([]) == 0
    assert svc.longest_streak_weeks([date(2026, 8, 5)]) == 1


def test_annual_heatmap(db_session):
    user, _, _ = seed_user_with_workouts(db_session)
    heatmap = dict(svc.annual_heatmap(db_session, user.id, 2026))
    assert heatmap[date(2026, 7, 27)] == 1
    assert heatmap[date(2026, 8, 3)] == 1
    assert date(2026, 1, 1) not in heatmap


def test_trained_exercise_ids(db_session):
    user, _, bench = seed_user_with_workouts(db_session)
    # ejercicio nunca entrenado por este usuario: no debe aparecer
    untrained = models.Exercise(name_es="Sentadilla", name_en="Squat", measurement="strength")
    db_session.add(untrained)
    db_session.commit()

    assert svc.trained_exercise_ids(db_session, user.id) == {bench.id}
    assert untrained.id not in svc.trained_exercise_ids(db_session, user.id)


def test_muscle_distribution(db_session):
    user, chest, _ = seed_user_with_workouts(db_session)
    dist = svc.muscle_distribution(
        db_session, user.id, start=date(2026, 7, 1), end=date(2026, 8, 31)
    )
    assert dist == {chest.id: 3}
    only_august = svc.muscle_distribution(
        db_session, user.id, start=date(2026, 8, 1), end=date(2026, 8, 31)
    )
    assert only_august == {chest.id: 1}


def seed_stats_user(db_session):
    """Escenario con números conocidos a mano para test_lifetime_stats_seeded_numbers:
    2 entrenos terminados (fuerza + cardio) y uno ACTIVO (sin ended_at) que
    prueba que sus series sí cuentan en sets/reps/volumen (ya están registradas)
    pero no en total_workouts/total_gym_seconds (eso exige entreno terminado)."""
    user = models.User(username="freya", password_hash="x")
    bench = models.Exercise(name_es="Press", name_en="Bench", measurement="strength")
    run = models.Exercise(name_es="Correr", name_en="Run", measurement="cardio")
    db_session.add_all([user, bench, run])
    db_session.flush()

    # Workout A (terminado, 1h = 3600s): 1 calentamiento (excluido) + 2 series
    # efectivas — volumen 5*100 + 5*105 = 1025
    workout_a = models.Workout(
        owner_id=user.id,
        date=date(2026, 7, 27),
        started_at=datetime(2026, 7, 27, 10, 0, 0),
        ended_at=datetime(2026, 7, 27, 11, 0, 0),
    )
    db_session.add(workout_a)
    db_session.flush()
    wex_a = models.WorkoutExercise(workout_id=workout_a.id, exercise_id=bench.id, position=1)
    db_session.add(wex_a)
    db_session.flush()
    db_session.add_all([
        models.WorkoutSet(
            workout_exercise_id=wex_a.id, set_number=1, reps=5, weight_kg=90, is_warmup=True
        ),
        models.WorkoutSet(workout_exercise_id=wex_a.id, set_number=2, reps=5, weight_kg=100),
        models.WorkoutSet(workout_exercise_id=wex_a.id, set_number=3, reps=5, weight_kg=105),
    ])

    # Workout B (terminado, 45min = 2700s): 1 serie de cardio, sin reps/peso
    workout_b = models.Workout(
        owner_id=user.id,
        date=date(2026, 8, 3),
        started_at=datetime(2026, 8, 3, 9, 0, 0),
        ended_at=datetime(2026, 8, 3, 9, 45, 0),
    )
    db_session.add(workout_b)
    db_session.flush()
    wex_b = models.WorkoutExercise(workout_id=workout_b.id, exercise_id=run.id, position=1)
    db_session.add(wex_b)
    db_session.flush()
    db_session.add(
        models.WorkoutSet(
            workout_exercise_id=wex_b.id, set_number=1, duration_seconds=1800, distance_m=5000
        )
    )

    # Workout C: ACTIVO (ended_at None) — mismo lunes ISO que B (semana 32),
    # no debe sumar workout ni tiempo de gym
    workout_c = models.Workout(
        owner_id=user.id, date=date(2026, 8, 5), started_at=datetime(2026, 8, 5, 8, 0, 0)
    )
    db_session.add(workout_c)
    db_session.flush()
    wex_c = models.WorkoutExercise(workout_id=workout_c.id, exercise_id=bench.id, position=1)
    db_session.add(wex_c)
    db_session.flush()
    db_session.add(
        models.WorkoutSet(workout_exercise_id=wex_c.id, set_number=1, reps=5, weight_kg=110)
    )

    db_session.add_all([
        models.PersonalRecord(
            owner_id=user.id, exercise_id=bench.id, kind="max_weight", value=105,
            achieved_at=datetime(2026, 7, 27, 11, 0, 0),
        ),
        models.PersonalRecord(
            owner_id=user.id, exercise_id=bench.id, kind="est_1rm", value=122.5,
            achieved_at=datetime(2026, 7, 27, 11, 0, 0),
        ),
    ])
    db_session.commit()
    return user


def test_lifetime_stats_seeded_numbers(db_session):
    user = seed_stats_user(db_session)
    stats = svc.lifetime_stats(db_session, user.id)
    assert stats == {
        "total_workouts": 2,               # A y B; C sigue activo
        "total_gym_seconds": 6300,         # 3600 (A) + 2700 (B)
        "total_cardio_seconds": 1800,      # única serie de cardio (B)
        "total_distance_m": 5000.0,
        "total_volume_kg": 1575.0,         # 1025 (A, sin el calentamiento) + 550 (C)
        "total_sets": 4,                   # 2 (A, efectivas) + 1 (B, cardio) + 1 (C)
        "total_reps": 15,                  # 5+5 (A) + 5 (C); la de cardio no tiene reps
        "prs_count": 2,
        "avg_session_seconds": 3150.0,     # 6300 / 2
        "longest_streak_weeks": 2,         # semanas 31 (A) y 32 (B y C) consecutivas
    }


def test_lifetime_stats_empty_user(db_session):
    user = models.User(username="ghost", password_hash="x")
    db_session.add(user)
    db_session.commit()
    stats = svc.lifetime_stats(db_session, user.id)
    assert stats == {
        "total_workouts": 0,
        "total_gym_seconds": 0,
        "total_cardio_seconds": 0,
        "total_distance_m": 0.0,
        "total_volume_kg": 0.0,
        "total_sets": 0,
        "total_reps": 0,
        "prs_count": 0,
        "avg_session_seconds": 0.0,
        "longest_streak_weeks": 0,
    }
