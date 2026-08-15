"""v0.18.0 — load_mode por SERIE (zurdi: "el modo se pone cuando vas a
hacer el ejercicio — un día la polea libre es la de kg y otro la de
niveles"): el cajón elige kg/nivel al registrar; los PRs compiten solo
dentro de su modo y las series de nivel quedan fuera del volumen."""

from fastapi.testclient import TestClient


def _muscle_group_id(client: TestClient) -> int:
    return client.get("/api/v1/muscle-groups").json()[0]["id"]


def make_exercise(client: TestClient, name: str) -> dict:
    resp = client.post(
        "/api/v1/exercises",
        json={
            "name_es": name,
            "name_en": name,
            "measurement": "strength",
            "muscle_groups": [
                {"muscle_group_id": _muscle_group_id(client), "is_primary": True}
            ],
        },
    )
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


def test_set_load_mode_defaults_to_weight_and_round_trips(client: TestClient):
    exercise = make_exercise(client, "Polea al pecho")
    workout, wex = start_with(client, exercise["id"])

    plain = log(client, workout, wex, reps=8, weight_kg=40)
    assert plain["set"]["load_mode"] == "weight"

    level = log(client, workout, wex, reps=8, weight_kg=12, load_mode="level")
    assert level["set"]["load_mode"] == "level"

    # editable a posteriori (corregir una serie apuntada en el modo equivocado)
    url = f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets/{plain['set']['id']}"
    edited = client.patch(url, json={"reps": 8, "weight_kg": 14, "load_mode": "level"}).json()
    assert edited["load_mode"] == "level"

    resp = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets",
        json={"reps": 8, "weight_kg": 10, "load_mode": "banana"},
    )
    assert resp.status_code == 422


def test_prs_compete_only_within_their_mode(client: TestClient):
    exercise = make_exercise(client, "Polea mixta")
    workout, wex = start_with(client, exercise["id"])

    # serie en kg: los 3 kinds de siempre
    body = log(client, workout, wex, reps=5, weight_kg=100)
    assert {r["kind"] for r in body["new_records"]} == {"max_weight", "est_1rm", "max_volume"}
    assert all(r["load_mode"] == "weight" for r in body["new_records"])

    # serie en nivel: SOLO max_weight, y puntúa aunque 12 < 100 kg (compite
    # contra récords de nivel, no contra los de kg)
    body = log(client, workout, wex, reps=10, weight_kg=12, load_mode="level")
    assert {r["kind"] for r in body["new_records"]} == {"max_weight"}
    assert body["new_records"][0]["load_mode"] == "level"

    # subir de nivel vuelve a puntuar; repetir nivel no
    body = log(client, workout, wex, reps=10, weight_kg=14, load_mode="level")
    assert {r["kind"] for r in body["new_records"]} == {"max_weight"}
    body = log(client, workout, wex, reps=10, weight_kg=14, load_mode="level")
    assert body["new_records"] == []

    # y un kg más alto sigue puntuando en SU modo, ajeno a los niveles
    body = log(client, workout, wex, reps=5, weight_kg=105)
    assert "max_weight" in {r["kind"] for r in body["new_records"]}


def test_level_sets_are_excluded_from_volume_aggregates(client: TestClient):
    exercise = make_exercise(client, "Polea volumen")
    workout, wex = start_with(client, exercise["id"])
    log(client, workout, wex, reps=10, weight_kg=15, load_mode="level")
    log(client, workout, wex, reps=5, weight_kg=100)
    client.post(f"/api/v1/workouts/{workout['id']}/finish")

    stats = client.get("/api/v1/progress/stats").json()
    # solo el 5×100 en kg; el 10×nivel-15 queda fuera
    assert stats["total_volume_kg"] == 500.0

    feed = client.get("/api/v1/social/feed").json()
    me = next(row for row in feed["comparison"] if row["is_me"])
    assert me["week_volume_kg"] == 500.0

    # la serie temporal del ejercicio tampoco mezcla niveles en el eje de kg
    series = client.get(f"/api/v1/progress/exercises/{exercise['id']}").json()["series"]
    assert len(series) == 1 and series[0]["top_weight"] == 100.0


def test_history_carries_the_mode_for_prefill(client: TestClient):
    exercise = make_exercise(client, "Polea historia")
    workout, wex = start_with(client, exercise["id"])
    log(client, workout, wex, reps=8, weight_kg=12, load_mode="level")
    client.post(f"/api/v1/workouts/{workout['id']}/finish")

    history = client.get(f"/api/v1/progress/exercise-history/{exercise['id']}").json()
    assert history["sets"][0]["load_mode"] == "level"
