"""v0.14.0 — plan rotatorio de rutinas: el "te toca" se deriva del historial."""

from fastapi.testclient import TestClient

from tests.conftest import login, make_user


def _routine(client: TestClient, name: str) -> int:
    return client.post("/api/v1/routines", json={"name": name}).json()["id"]


def _train_with(client: TestClient, routine_id: int, day: str) -> None:
    workout = client.post(
        "/api/v1/workouts", json={"date": day, "routine_id": routine_id}
    ).json()
    client.post(f"/api/v1/workouts/{workout['id']}/finish")


def test_rotation_roundtrip_and_next_pointer(client: TestClient):
    push = _routine(client, "Empuje")
    pull = _routine(client, "Tirón")
    legs = _routine(client, "Pierna")
    cardio = _routine(client, "Cardio")

    # sin plan: next None
    assert client.get("/api/v1/rotation").json() == {"routines": [], "next_position": None}

    resp = client.put(
        "/api/v1/rotation", json={"routine_ids": [push, pull, legs, cardio]}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert [r["name"] for r in body["routines"]] == ["Empuje", "Tirón", "Pierna", "Cardio"]
    # plan recién creado, sin historial: toca la primera
    assert body["next_position"] == 0

    # entrenar la primera → toca la segunda
    _train_with(client, push, "2026-08-03")
    assert client.get("/api/v1/rotation").json()["next_position"] == 1

    # semana a medias: la segunda se hace días después — sigue el ORDEN, no la semana
    _train_with(client, pull, "2026-08-10")
    assert client.get("/api/v1/rotation").json()["next_position"] == 2

    # completar el ciclo → vuelve a la primera (cíclico)
    _train_with(client, legs, "2026-08-11")
    _train_with(client, cardio, "2026-08-12")
    assert client.get("/api/v1/rotation").json()["next_position"] == 0

    # un entreno SIN rutina (ad-hoc) no mueve el puntero
    workout = client.post("/api/v1/workouts", json={"date": "2026-08-13"}).json()
    client.post(f"/api/v1/workouts/{workout['id']}/finish")
    assert client.get("/api/v1/rotation").json()["next_position"] == 0

    # saltarse el orden a mano: hacer la 3ª → la sugerencia pasa a la 4ª
    _train_with(client, legs, "2026-08-14")
    assert client.get("/api/v1/rotation").json()["next_position"] == 3


def test_rotation_edit_and_validation(client: TestClient, app):
    push = _routine(client, "Empuje")
    pull = _routine(client, "Tirón")
    client.put("/api/v1/rotation", json={"routine_ids": [push, pull]})

    # reemplazo completo con reorden
    body = client.put("/api/v1/rotation", json={"routine_ids": [pull, push]}).json()
    assert [r["id"] for r in body["routines"]] == [pull, push]

    # duplicados → 422 con slug
    resp = client.put("/api/v1/rotation", json={"routine_ids": [push, push]})
    assert resp.status_code == 422
    assert resp.json()["detail"] == "rotation_duplicate_routine"

    # rutina ajena GLOBAL → usable en la rotación de otro (push nace global
    # por defecto, decisión v0.4.3); una PRIVADA ajena → 404
    private = client.post("/api/v1/routines", json={"name": "Secreta", "is_global": False}).json()["id"]
    make_user(client, "freyja")
    freyja = login(app, "freyja")

    # la rotación es POR USUARIO: freyja no ve la del admin
    assert freyja.get("/api/v1/rotation").json() == {"routines": [], "next_position": None}

    assert freyja.put("/api/v1/rotation", json={"routine_ids": [push]}).status_code == 200
    assert (
        freyja.put("/api/v1/rotation", json={"routine_ids": [private]}).status_code == 404
    )

    # vaciar el plan
    assert client.put("/api/v1/rotation", json={"routine_ids": []}).json() == {
        "routines": [],
        "next_position": None,
    }


def test_start_from_foreign_global_routine(client: TestClient, app):
    """v0.14.1 — el bug del plan de zurdi: la rotación acepta globales ajenas,
    así que arrancar un entreno desde ellas también debe funcionar."""
    shared = _routine(client, "Global del admin")  # nace is_global (v0.4.3)
    private = client.post(
        "/api/v1/routines", json={"name": "Privada", "is_global": False}
    ).json()["id"]
    make_user(client, "freyja")
    freyja = login(app, "freyja")

    resp = freyja.post("/api/v1/workouts", json={"routine_id": shared})
    assert resp.status_code == 201, resp.text
    workout = resp.json()
    assert workout["routine_id"] == shared
    freyja.delete(f"/api/v1/workouts/{workout['id']}")

    resp = freyja.post("/api/v1/workouts", json={"routine_id": private})
    assert resp.status_code == 422
    assert resp.json()["detail"] == "routine_invalid"
