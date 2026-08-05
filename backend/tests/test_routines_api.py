from fastapi.testclient import TestClient

from tests.conftest import login, make_user


def bench_id(client) -> int:
    return next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )


def squat_id(client) -> int:
    return next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Squat"
    )


def test_routine_crud_and_exercise_replacement(client: TestClient):
    resp = client.post(
        "/api/v1/routines", json={"name": "Push A", "rune": "ᚦ", "color": "ember"}
    )
    assert resp.status_code == 201
    rid = resp.json()["id"]
    assert resp.json()["exercises"] == []

    resp = client.put(
        f"/api/v1/routines/{rid}/exercises",
        json=[
            {"exercise_id": bench_id(client), "target_sets": 4, "target_reps": 8, "rest_seconds": 120},
            {"exercise_id": squat_id(client), "target_sets": 3},
        ],
    )
    assert resp.status_code == 200
    exercises = resp.json()["exercises"]
    assert [e["position"] for e in exercises] == [1, 2]
    assert exercises[0]["target_reps"] == 8

    # reemplazo reordena y elimina
    resp = client.put(
        f"/api/v1/routines/{rid}/exercises",
        json=[{"exercise_id": squat_id(client), "target_sets": 5}],
    )
    assert [e["exercise_id"] for e in resp.json()["exercises"]] == [squat_id(client)]

    resp = client.patch(f"/api/v1/routines/{rid}", json={"name": "Push B"})
    assert resp.json()["name"] == "Push B"
    assert client.delete(f"/api/v1/routines/{rid}").status_code == 204
    assert client.get(f"/api/v1/routines/{rid}").status_code == 404


def test_routines_are_private(client: TestClient, app):
    rid = client.post("/api/v1/routines", json={"name": "Secreta"}).json()["id"]
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert freyja.get("/api/v1/routines").json() == []
    assert freyja.get(f"/api/v1/routines/{rid}").status_code == 404
    assert freyja.delete(f"/api/v1/routines/{rid}").status_code == 404


def test_put_exercises_rejects_invisible_exercise(client: TestClient, app):
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
    rid = client.post("/api/v1/routines", json={"name": "Push"}).json()["id"]
    resp = client.put(
        f"/api/v1/routines/{rid}/exercises", json=[{"exercise_id": custom, "target_sets": 3}]
    )
    assert resp.status_code == 422 and resp.json()["detail"] == "exercise_invalid"
