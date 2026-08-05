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
