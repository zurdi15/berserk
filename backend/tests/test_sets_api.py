from fastapi.testclient import TestClient


def exercise_id(client, name_en) -> int:
    return next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == name_en
    )


def start_with_exercise(client, name_en="Bench press"):
    workout = client.post("/api/v1/workouts", json={}).json()
    wex = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises",
        json={"exercise_id": exercise_id(client, name_en)},
    ).json()
    return workout, wex


def test_log_sets_and_pr_flow(client: TestClient):
    workout, wex = start_with_exercise(client)
    resp = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets",
        json={"reps": 5, "weight_kg": 100},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["set"]["set_number"] == 1
    assert {r["kind"] for r in body["new_records"]} == {"max_weight", "est_1rm", "max_volume"}

    # segunda serie floja: solo cae el PR de volumen
    body = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets",
        json={"reps": 5, "weight_kg": 60},
    ).json()
    assert {r["kind"] for r in body["new_records"]} == {"max_volume"}

    # calentamiento: numera pero no puntúa
    body = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets",
        json={"reps": 10, "weight_kg": 40, "is_warmup": True},
    ).json()
    assert body["set"]["set_number"] == 3 and body["new_records"] == []


def test_set_validation_by_measurement(client: TestClient):
    workout, wex = start_with_exercise(client, "Plank")
    url = f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets"
    resp = client.post(url, json={"reps": 10})
    assert resp.status_code == 422 and resp.json()["detail"] == "invalid_set_fields"
    assert client.post(url, json={"duration_seconds": 60}).status_code == 201


def test_edit_and_delete_set(client: TestClient):
    workout, wex = start_with_exercise(client)
    url = f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets"
    logged = client.post(url, json={"reps": 5, "weight_kg": 100}).json()
    sid = logged["set"]["id"]

    resp = client.patch(f"{url}/{sid}", json={"reps": 6, "weight_kg": 100, "rpe": 8})
    assert resp.status_code == 200 and resp.json()["reps"] == 6
    # editar quitando el peso a un ejercicio strength -> 422
    assert client.patch(f"{url}/{sid}", json={"reps": 6, "weight_kg": None}).status_code == 422

    # borrar la serie: el barrido de sus PRs se verifica por DB en el siguiente test
    assert client.delete(f"{url}/{sid}").status_code == 204


def test_update_set_sweeps_and_redetects_prs(client: TestClient, db_session):
    from sqlalchemy import select

    from app import models

    workout, wex = start_with_exercise(client)
    url = f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets"
    sid = client.post(url, json={"reps": 5, "weight_kg": 1000}).json()["set"]["id"]

    # corregir el fat-finger: 1000kg -> 100kg no debe dejar récords fantasma
    resp = client.patch(f"{url}/{sid}", json={"reps": 5, "weight_kg": 100})
    assert resp.status_code == 200
    # sin celebración: la respuesta sigue siendo solo la serie (SetOut)
    assert "new_records" not in resp.json()

    db_session.expire_all()
    records = db_session.scalars(select(models.PersonalRecord)).all()
    assert records != []
    assert all(r.value < 1000 for r in records)
    values = {r.kind: r.value for r in records}
    assert values["max_weight"] == 100
    assert values["max_volume"] == 500


def test_delete_set_removes_its_prs(client: TestClient, db_session):
    from sqlalchemy import select

    from app import models

    workout, wex = start_with_exercise(client)
    url = f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets"
    sid = client.post(url, json={"reps": 5, "weight_kg": 100}).json()["set"]["id"]
    assert db_session.scalars(select(models.PersonalRecord)).all() != []
    client.delete(f"{url}/{sid}")
    db_session.expire_all()
    assert db_session.scalars(select(models.PersonalRecord)).all() == []


def test_reorder_and_manual_tags(client: TestClient):
    workout, wex1 = start_with_exercise(client)
    wex2 = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises",
        json={"exercise_id": exercise_id(client, "Squat")},
    ).json()
    resp = client.put(
        f"/api/v1/workouts/{workout['id']}/exercises-order",
        json={"workout_exercise_ids": [wex2["id"], wex1["id"]]},
    )
    assert resp.status_code == 200
    assert [e["id"] for e in resp.json()["exercises"]] == [wex2["id"], wex1["id"]]
    # lista incompleta -> 422
    resp = client.put(
        f"/api/v1/workouts/{workout['id']}/exercises-order",
        json={"workout_exercise_ids": [wex1["id"]]},
    )
    assert resp.status_code == 422 and resp.json()["detail"] == "order_invalid"

    legs = next(
        g["id"] for g in client.get("/api/v1/muscle-groups").json() if g["slug"] == "legs"
    )
    resp = client.put(
        f"/api/v1/workouts/{workout['id']}/muscle-groups", json={"muscle_group_ids": [legs]}
    )
    assert resp.status_code == 200 and resp.json()["muscle_tag_ids"] == [legs]
    assert client.put(
        f"/api/v1/workouts/{workout['id']}/muscle-groups", json={"muscle_group_ids": [99999]}
    ).status_code == 422
