from datetime import date

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
        workout = models.Workout(owner_id=user.id, date=day)
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


def test_annual_heatmap(db_session):
    user, _, _ = seed_user_with_workouts(db_session)
    heatmap = dict(svc.annual_heatmap(db_session, user.id, 2026))
    assert heatmap[date(2026, 7, 27)] == 1
    assert heatmap[date(2026, 8, 3)] == 1
    assert date(2026, 1, 1) not in heatmap


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
