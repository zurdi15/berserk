from datetime import date

from fastapi.testclient import TestClient


def test_schedule_crud_and_month_view(client: TestClient):
    rid = client.post("/api/v1/routines", json={"name": "Push"}).json()["id"]
    resp = client.post(
        "/api/v1/calendar",
        json={"date": "2026-08-10", "time": "18:30:00", "routine_id": rid, "note": "con Loki"},
    )
    assert resp.status_code == 201
    sid = resp.json()["id"]
    assert resp.json()["status"] == "planned"

    # rutina ajena/inexistente -> 422
    assert client.post(
        "/api/v1/calendar", json={"date": "2026-08-11", "routine_id": 9999}
    ).status_code == 422

    month = client.get("/api/v1/calendar/2026/8").json()
    assert [s["id"] for s in month["scheduled"]] == [sid]
    assert month["workouts"] == []

    resp = client.patch(f"/api/v1/calendar/{sid}", json={"status": "skipped"})
    assert resp.status_code == 200 and resp.json()["status"] == "skipped"
    # 'done' directo no es alcanzable: 422 del schema
    assert client.patch(f"/api/v1/calendar/{sid}", json={"status": "done"}).status_code == 422

    assert client.delete(f"/api/v1/calendar/{sid}").status_code == 204
    assert client.get("/api/v1/calendar/2026/8").json()["scheduled"] == []


def test_month_view_includes_workout_muscle_groups(client: TestClient):
    bench = next(
        e for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )
    primary = next(l["muscle_group_id"] for l in bench["muscle_groups"] if l["is_primary"])
    workout = client.post("/api/v1/workouts", json={"date": "2026-08-05"}).json()
    wex = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises", json={"exercise_id": bench["id"]}
    ).json()
    client.post(
        f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets",
        json={"reps": 5, "weight_kg": 100},
    )
    core = next(
        g["id"] for g in client.get("/api/v1/muscle-groups").json() if g["slug"] == "core"
    )
    client.put(f"/api/v1/workouts/{workout['id']}/muscle-groups", json={"muscle_group_ids": [core]})
    client.post(f"/api/v1/workouts/{workout['id']}/finish")

    month = client.get("/api/v1/calendar/2026/8").json()
    summary = next(w for w in month["workouts"] if w["id"] == workout["id"])
    assert set(summary["muscle_group_ids"]) == {primary, core}  # derivado ∪ manual
