"""v0.17.0 — bloques (zurdi: "definir bloques en las rutinas, cada bloque
tiene unos ejercicios y cada step del stepper es un bloque"): block_label en
routine_exercises/workout_exercises, snapshot al empezar (patrón
superset_group) y aceptado en el alta ad-hoc del entreno."""

from fastapi.testclient import TestClient


def _exercise_ids(client: TestClient, count: int) -> list[int]:
    exercises = client.get("/api/v1/exercises").json()
    return [e["id"] for e in exercises[:count]]


def make_routine_with_blocks(client: TestClient) -> dict:
    routine = client.post("/api/v1/routines", json={"name": "Torso bloques"}).json()
    a, b, c = _exercise_ids(client, 3)
    resp = client.put(
        f"/api/v1/routines/{routine['id']}/exercises",
        json=[
            {"exercise_id": a, "block_label": "Empuje"},
            {"exercise_id": b, "block_label": "Empuje"},
            {"exercise_id": c, "block_label": "Tirón"},
        ],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_routine_block_labels_round_trip(client: TestClient):
    routine = make_routine_with_blocks(client)
    labels = [e["block_label"] for e in routine["exercises"]]
    assert labels == ["Empuje", "Empuje", "Tirón"]


def test_start_workout_snapshots_block_labels(client: TestClient):
    routine = make_routine_with_blocks(client)
    workout = client.post("/api/v1/workouts", json={"routine_id": routine["id"]}).json()
    labels = [e["block_label"] for e in workout["exercises"]]
    assert labels == ["Empuje", "Empuje", "Tirón"]


def test_add_exercise_accepts_block_label(client: TestClient):
    workout = client.post("/api/v1/workouts", json={}).json()
    exercise_id = _exercise_ids(client, 1)[0]
    wex = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises",
        json={"exercise_id": exercise_id, "block_label": "Accesorios"},
    ).json()
    assert wex["block_label"] == "Accesorios"

    # sin etiqueta sigue naciendo suelto
    other = _exercise_ids(client, 2)[1]
    wex2 = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises", json={"exercise_id": other}
    ).json()
    assert wex2["block_label"] is None


def test_patch_moves_exercise_between_blocks_mid_workout(client: TestClient):
    """v0.18.1 (zurdi: "los bloques deberían poder cambiarse también mid
    entreno"): PATCH block_label mueve, estrena bloque o saca a sin-bloque."""
    routine = make_routine_with_blocks(client)
    workout = client.post("/api/v1/workouts", json={"routine_id": routine["id"]}).json()
    wex = workout["exercises"][0]
    url = f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}"

    # mover a un bloque existente
    moved = client.patch(url, json={"block_label": "Tirón"}).json()
    assert moved["block_label"] == "Tirón"

    # estrenar un bloque nuevo mid-entreno
    fresh = client.patch(url, json={"block_label": "Aislamiento"}).json()
    assert fresh["block_label"] == "Aislamiento"

    # null explícito lo saca a "sin bloque"; un PATCH de otra cosa no lo toca
    cleared = client.patch(url, json={"block_label": None}).json()
    assert cleared["block_label"] is None
    untouched = client.patch(url, json={"rest_seconds": 90}).json()
    assert untouched["block_label"] is None and untouched["rest_seconds"] == 90


def test_copy_routine_preserves_block_labels(client: TestClient):
    routine = make_routine_with_blocks(client)
    copy = client.post(f"/api/v1/routines/{routine['id']}/copy").json()
    labels = [e["block_label"] for e in copy["exercises"]]
    assert labels == ["Empuje", "Empuje", "Tirón"]


def test_patch_completed_flag_round_trip(client: TestClient):
    """v0.38.0 (zurdi: "check de marcar ejercicio como completado"): el flag
    nace en false, se marca y se desmarca por PATCH, y un PATCH de otra cosa
    no lo toca (exclude_unset)."""
    routine = make_routine_with_blocks(client)
    workout = client.post("/api/v1/workouts", json={"routine_id": routine["id"]}).json()
    wex = workout["exercises"][0]
    assert wex["completed"] is False
    url = f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}"

    done = client.patch(url, json={"completed": True}).json()
    assert done["completed"] is True
    untouched = client.patch(url, json={"rest_seconds": 90}).json()
    assert untouched["completed"] is True and untouched["rest_seconds"] == 90
    undone = client.patch(url, json={"completed": False}).json()
    assert undone["completed"] is False
    # y el GET del entreno lo refleja
    fetched = client.get(f"/api/v1/workouts/{workout['id']}").json()
    assert fetched["exercises"][0]["completed"] is False
