from datetime import date, timedelta

from fastapi.testclient import TestClient


def log_workout(client, day, reps=5, weight=100):
    bench = next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )
    workout = client.post("/api/v1/workouts", json={"date": day}).json()
    wex = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises", json={"exercise_id": bench}
    ).json()
    client.post(
        f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets",
        json={"reps": reps, "weight_kg": weight},
    )
    client.post(f"/api/v1/workouts/{workout['id']}/finish")
    return bench, workout["id"]


def test_series_records_heatmap_streak_distribution(client: TestClient):
    monday = date.today() - timedelta(days=date.today().weekday())
    bench, _ = log_workout(client, (monday - timedelta(weeks=1)).isoformat(), weight=100)
    log_workout(client, monday.isoformat(), weight=105)

    series = client.get(f"/api/v1/progress/exercises/{bench}").json()["series"]
    assert len(series) == 2 and series[1]["top_weight"] == 105

    records = client.get("/api/v1/progress/records").json()
    assert {r["kind"] for r in records} == {"max_weight", "est_1rm", "max_volume"}
    filtered = client.get(f"/api/v1/progress/records?exercise_id={bench}").json()
    assert len(filtered) == len(records)

    year = monday.year
    heatmap = client.get(f"/api/v1/progress/heatmap/{year}").json()
    assert any(d["count"] == 1 for d in heatmap)

    assert client.get("/api/v1/progress/streak").json()["weeks"] == 2

    dist = client.get("/api/v1/progress/muscle-distribution?weeks=4").json()
    assert sum(d["sets"] for d in dist) == 2


def test_trained_exercises(client: TestClient):
    exercises = client.get("/api/v1/exercises").json()
    bench = next(e["id"] for e in exercises if e["name_en"] == "Bench press")
    squat = next(e["id"] for e in exercises if e["name_en"] == "Squat")

    log_workout(client, date.today().isoformat(), reps=5, weight=100)  # entrena bench

    ids = client.get("/api/v1/progress/trained-exercises").json()["exercise_ids"]
    assert bench in ids
    assert squat not in ids


def test_trained_exercises_respects_athlete_threading(client: TestClient, app):
    from tests.conftest import login, make_user

    make_user(client, "freyja")
    log_workout(client, date.today().isoformat(), reps=5, weight=100)  # admin entrena bench

    freyja = login(app, "freyja")
    # freyja no ha entrenado nada todavía: su propia vista está vacía
    assert freyja.get("/api/v1/progress/trained-exercises").json()["exercise_ids"] == []


def test_stats(client: TestClient):
    log_workout(client, date.today().isoformat(), reps=5, weight=100)
    log_workout(client, date.today().isoformat(), reps=5, weight=110)

    result = client.get("/api/v1/progress/stats").json()
    assert result["total_workouts"] == 2
    assert result["total_sets"] == 2
    assert result["total_reps"] == 10
    assert result["total_volume_kg"] == 500 + 550
    # cada set bate los 3 tipos de récord del anterior (peso, 1RM y volumen
    # suben en el segundo entreno): 3 PRs por set logeado, 6 en total
    assert result["prs_count"] == 6
    assert result["total_cardio_seconds"] == 0
    assert result["total_distance_m"] == 0.0
    assert result["total_gym_seconds"] >= 0
    assert result["avg_session_seconds"] == result["total_gym_seconds"] / 2


# item 5 (post-0.3.0): 8A crea un entreno retroactivo con started_at==ended_at
# (duración 0) — antes de corregirla desde el editor, un retroactivo no debe
# aportar tiempo de gym; tras el patch de duration_minutes, sí
def test_stats_reflect_a_retro_workout_duration_edited_after_the_fact(client: TestClient):
    workout = client.post(
        "/api/v1/workouts", json={"date": "2026-07-20", "finished": True}
    ).json()

    before = client.get("/api/v1/progress/stats").json()
    assert before["total_workouts"] == 1
    assert before["total_gym_seconds"] == 0

    client.patch(f"/api/v1/workouts/{workout['id']}", json={"duration_minutes": 40})

    after = client.get("/api/v1/progress/stats").json()
    assert after["total_gym_seconds"] == 40 * 60
    assert after["avg_session_seconds"] == 40 * 60


def test_stats_respects_athlete_threading(client: TestClient, app):
    from tests.conftest import login, make_user

    make_user(client, "freyja")
    log_workout(client, date.today().isoformat(), reps=5, weight=100)  # admin entrena

    freyja = login(app, "freyja")
    # freyja no ha entrenado nada todavía: su propia vista está en cero
    own = freyja.get("/api/v1/progress/stats").json()
    assert own["total_workouts"] == 0
    assert own["total_volume_kg"] == 0.0
    assert own["prs_count"] == 0

    client.post("/api/v1/sharing", json={"username": "freyja"})
    admin_id = client.get("/api/v1/auth/me").json()["id"]
    shared = freyja.get(f"/api/v1/progress/stats?user_id={admin_id}").json()
    assert shared["total_workouts"] == 1
    assert shared["total_volume_kg"] == 500.0


def test_exercise_history_returns_latest_finished_session(client: TestClient):
    bench, first_id = log_workout(client, "2026-07-20", reps=5, weight=100)
    _, second_id = log_workout(client, "2026-08-01", reps=5, weight=105)

    result = client.get(f"/api/v1/progress/exercise-history/{bench}").json()
    assert result["workout_id"] == second_id
    assert result["date"] == "2026-08-01"
    assert result["sets"] == [
        {"reps": 5, "weight_kg": 105.0, "duration_seconds": None, "distance_m": None, "is_warmup": False}
    ]


def test_exercise_history_excludes_current_workout_and_null_when_none(client: TestClient):
    bench, only_id = log_workout(client, "2026-07-20", reps=5, weight=100)

    excluded = client.get(
        f"/api/v1/progress/exercise-history/{bench}?exclude_workout_id={only_id}"
    ).json()
    assert excluded is None


def test_exercise_history_ignores_the_active_unfinished_workout(client: TestClient):
    bench = next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )
    workout = client.post("/api/v1/workouts", json={}).json()
    wex = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises", json={"exercise_id": bench}
    ).json()
    client.post(
        f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets",
        json={"reps": 5, "weight_kg": 999},
    )
    # el entreno sigue activo (sin terminar): no debe contar como "última vez"
    assert client.get(f"/api/v1/progress/exercise-history/{bench}").json() is None


def test_exercise_history_of_invisible_exercise_404(client: TestClient, app):
    from tests.conftest import login, make_user

    make_user(client, "freyja")
    freyja = login(app, "freyja")
    chest = next(
        g["id"] for g in freyja.get("/api/v1/muscle-groups").json() if g["slug"] == "chest"
    )
    custom = freyja.post(
        "/api/v1/exercises",
        json={
            "name_es": "Mi press", "name_en": "My press", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
        },
    ).json()["id"]
    assert client.get(f"/api/v1/progress/exercise-history/{custom}").status_code == 404


def test_series_of_invisible_exercise_404(client: TestClient, app):
    from tests.conftest import login, make_user

    make_user(client, "freyja")
    freyja = login(app, "freyja")
    chest = next(
        g["id"] for g in freyja.get("/api/v1/muscle-groups").json() if g["slug"] == "chest"
    )
    custom = freyja.post(
        "/api/v1/exercises",
        json={
            "name_es": "Mi press", "name_en": "My press", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
        },
    ).json()["id"]
    assert client.get(f"/api/v1/progress/exercises/{custom}").status_code == 404


# v0.10.0 (zurdi): las últimas 4 veces de cardio viajan con el historial
def test_exercise_history_carries_recent_cardio(client):
    treadmill = next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["measurement"] == "cardio"
    )
    for day, minutes in [("2026-08-01", 20), ("2026-08-02", 18), ("2026-08-03", 25), ("2026-08-04", 22), ("2026-08-05", 30)]:
        w = client.post("/api/v1/workouts", json={"date": day, "finished": True}).json()
        wex = client.post(
            f"/api/v1/workouts/{w['id']}/exercises", json={"exercise_id": treadmill}
        ).json()
        client.post(
            f"/api/v1/workouts/{w['id']}/exercises/{wex['id']}/sets",
            json={"duration_seconds": minutes * 60},
        )

    history = client.get(f"/api/v1/progress/exercise-history/{treadmill}").json()
    recent = history["recent_cardio"]
    # las 4 más recientes, la última primero — la de 20min (5ª) se cae
    assert [r["duration_seconds"] for r in recent] == [30 * 60, 22 * 60, 25 * 60, 18 * 60]
    assert recent[0]["date"] == "2026-08-05"

    # un ejercicio de fuerza no arrastra la lista
    bench = next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )
    w = client.post("/api/v1/workouts", json={"date": "2026-08-05", "finished": True}).json()
    wex = client.post(f"/api/v1/workouts/{w['id']}/exercises", json={"exercise_id": bench}).json()
    client.post(
        f"/api/v1/workouts/{w['id']}/exercises/{wex['id']}/sets",
        json={"reps": 5, "weight_kg": 60},
    )
    strength_history = client.get(f"/api/v1/progress/exercise-history/{bench}").json()
    assert strength_history["recent_cardio"] == []
