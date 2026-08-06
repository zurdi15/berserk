from datetime import date

import pytest
from fastapi.testclient import TestClient

from tests.conftest import login, make_user


@pytest.fixture
def world(client: TestClient, app):
    """admin (owner con datos) comparte con freyja; loki queda fuera."""
    make_user(client, "freyja")
    make_user(client, "loki")
    bench = next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )
    workout = client.post("/api/v1/workouts", json={"date": "2026-08-05"}).json()
    wex = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises", json={"exercise_id": bench}
    ).json()
    client.post(
        f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets",
        json={"reps": 5, "weight_kg": 100},
    )
    client.post(f"/api/v1/workouts/{workout['id']}/finish")
    client.post("/api/v1/calendar", json={"date": "2026-08-10"})
    client.put("/api/v1/body/2026-08-05", json={"weight_kg": 80})
    client.post("/api/v1/sharing", json={"username": "freyja"})
    admin_id = client.get("/api/v1/auth/me").json()["id"]
    return {
        "admin_id": admin_id,
        "workout_id": workout["id"],
        "bench": bench,
        "freyja": login(app, "freyja"),
        "loki": login(app, "loki"),
    }


READ_PATHS = [
    "/api/v1/workouts?user_id={uid}",
    "/api/v1/workouts/{wid}?user_id={uid}",
    "/api/v1/calendar/2026/8?user_id={uid}",
    "/api/v1/progress/exercises/{bench}?user_id={uid}",
    "/api/v1/progress/records?user_id={uid}",
    "/api/v1/progress/heatmap/2026?user_id={uid}",
    "/api/v1/progress/streak?user_id={uid}",
    "/api/v1/progress/trained-exercises?user_id={uid}",
    "/api/v1/progress/muscle-distribution?user_id={uid}",
    "/api/v1/progress/stats?user_id={uid}",
    "/api/v1/body?user_id={uid}",
    "/api/v1/exercises?user_id={uid}",
    "/api/v1/muscle-groups?user_id={uid}",
]


def expand(path, world):
    return path.format(
        uid=world["admin_id"], wid=world["workout_id"], bench=world["bench"]
    )


def test_viewer_reads_everything(world):
    for path in READ_PATHS:
        resp = world["freyja"].get(expand(path, world))
        assert resp.status_code == 200, path


def test_stranger_gets_404_everywhere(world):
    for path in READ_PATHS:
        resp = world["loki"].get(expand(path, world))
        assert resp.status_code == 404, path


def test_viewer_cannot_write(world):
    freyja, wid = world["freyja"], world["workout_id"]
    # las mutaciones no aceptan user_id: siempre operan sobre el propio usuario
    assert freyja.patch(f"/api/v1/workouts/{wid}", json={"note": "hack"}).status_code == 404
    assert freyja.delete(f"/api/v1/workouts/{wid}").status_code == 404
    own = freyja.post("/api/v1/workouts", json={})
    assert own.status_code == 201
    assert own.json()["id"] != wid  # crea el suyo, no toca el ajeno


def test_revoke_closes_the_door(client: TestClient, world):
    freyja_id = client.get("/api/v1/sharing").json()["given"][0]["id"]
    client.delete(f"/api/v1/sharing/{freyja_id}")
    for path in READ_PATHS:
        assert world["freyja"].get(expand(path, world)).status_code == 404, path


def test_all_phase2_routers_mounted(client: TestClient):
    paths = client.get("/api/openapi.json").json()["paths"]
    for prefix in (
        "/api/v1/sharing", "/api/v1/exercises", "/api/v1/muscle-groups",
        "/api/v1/routines", "/api/v1/workouts", "/api/v1/calendar/{year}/{month}",
        "/api/v1/progress/streak", "/api/v1/body",
    ):
        assert any(p.startswith(prefix) for p in paths), prefix
