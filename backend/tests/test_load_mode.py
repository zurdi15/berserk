"""v0.17.0 — load_mode 'level' (zurdi: "números planos, del 1 al 20, en vez
de kg"): el valor sigue viajando en weight_kg, pero un ejercicio en modo
nivel solo puntúa max_weight (el nivel más alto) y sus series quedan fuera
de los agregados de volumen."""

from fastapi.testclient import TestClient


def _muscle_group_id(client: TestClient) -> int:
    return client.get("/api/v1/muscle-groups").json()[0]["id"]


def make_exercise(client: TestClient, name: str, load_mode: str | None = None) -> dict:
    payload = {
        "name_es": name,
        "name_en": name,
        "measurement": "strength",
        "muscle_groups": [{"muscle_group_id": _muscle_group_id(client), "is_primary": True}],
    }
    if load_mode is not None:
        payload["load_mode"] = load_mode
    resp = client.post("/api/v1/exercises", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def start_with(client: TestClient, exercise_id: int):
    workout = client.post("/api/v1/workouts", json={}).json()
    wex = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises",
        json={"exercise_id": exercise_id},
    ).json()
    return workout, wex


def log(client: TestClient, workout, wex, **fields) -> dict:
    resp = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets", json=fields
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_load_mode_defaults_to_weight_and_is_creatable_and_patchable(client: TestClient):
    plain = make_exercise(client, "Press banca test")
    assert plain["load_mode"] == "weight"

    level = make_exercise(client, "Máquina asistida", load_mode="level")
    assert level["load_mode"] == "level"

    resp = client.patch(f"/api/v1/exercises/{plain['id']}", json={"load_mode": "level"})
    assert resp.status_code == 200 and resp.json()["load_mode"] == "level"

    # valor fuera del enum -> 422 de pydantic
    resp = client.patch(f"/api/v1/exercises/{plain['id']}", json={"load_mode": "banana"})
    assert resp.status_code == 422


def test_level_exercise_only_scores_max_weight_pr(client: TestClient):
    level = make_exercise(client, "Jalón asistido", load_mode="level")
    workout, wex = start_with(client, level["id"])

    body = log(client, workout, wex, reps=10, weight_kg=12)
    assert {r["kind"] for r in body["new_records"]} == {"max_weight"}

    # subir de nivel vuelve a puntuar; mismas reps a nivel más bajo, no
    body = log(client, workout, wex, reps=10, weight_kg=14)
    assert {r["kind"] for r in body["new_records"]} == {"max_weight"}
    body = log(client, workout, wex, reps=12, weight_kg=10)
    assert body["new_records"] == []


def test_level_sets_are_excluded_from_volume_aggregates(client: TestClient):
    level = make_exercise(client, "Fondos asistidos", load_mode="level")
    weight = make_exercise(client, "Sentadilla test")
    workout = client.post("/api/v1/workouts", json={}).json()
    wex_level = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises", json={"exercise_id": level["id"]}
    ).json()
    wex_weight = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises", json={"exercise_id": weight["id"]}
    ).json()
    log(client, workout, wex_level, reps=10, weight_kg=15)
    log(client, workout, wex_weight, reps=5, weight_kg=100)
    client.post(f"/api/v1/workouts/{workout['id']}/finish")

    stats = client.get("/api/v1/progress/stats").json()
    # solo cuenta el 5×100 del ejercicio en kg; el 10×15 de nivel queda fuera
    assert stats["total_volume_kg"] == 500.0

    # misma regla en la comparativa semanal del feed social (fila propia)
    feed = client.get("/api/v1/social/feed").json()
    me = next(row for row in feed["comparison"] if row["is_me"])
    assert me["week_volume_kg"] == 500.0
