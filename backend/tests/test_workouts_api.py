from datetime import date

from fastapi.testclient import TestClient

from tests.conftest import login, make_user


def bench_id(client) -> int:
    return next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )


def exercise_id(client, name_en: str) -> int:
    return next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == name_en
    )


def muscle_group_id(client, slug: str) -> int:
    return next(g["id"] for g in client.get("/api/v1/muscle-groups").json() if g["slug"] == slug)


def make_routine(client) -> int:
    rid = client.post("/api/v1/routines", json={"name": "Push"}).json()["id"]
    client.put(
        f"/api/v1/routines/{rid}/exercises",
        json=[{"exercise_id": bench_id(client), "target_sets": 3, "rest_seconds": 90}],
    )
    return rid


def test_start_empty_and_single_active(client: TestClient):
    resp = client.post("/api/v1/workouts", json={})
    assert resp.status_code == 201
    workout = resp.json()
    assert workout["date"] == date.today().isoformat()
    assert workout["ended_at"] is None and workout["exercises"] == []

    assert client.post("/api/v1/workouts", json={}).status_code == 409
    active = client.get("/api/v1/workouts/active")
    assert active.status_code == 200 and active.json()["id"] == workout["id"]

    assert client.post(f"/api/v1/workouts/{workout['id']}/finish").status_code == 200
    assert client.get("/api/v1/workouts/active").status_code == 404
    resp = client.post(f"/api/v1/workouts/{workout['id']}/finish")
    assert resp.status_code == 409 and resp.json()["detail"] == "workout_already_finished"


def test_start_from_routine_copies_exercises(client: TestClient):
    rid = make_routine(client)
    workout = client.post("/api/v1/workouts", json={"routine_id": rid}).json()
    assert workout["routine_id"] == rid
    assert [e["exercise_id"] for e in workout["exercises"]] == [bench_id(client)]
    client.post(f"/api/v1/workouts/{workout['id']}/finish")


def test_start_from_scheduled_session(client: TestClient, db_session):
    # el router de calendario llega en Task 11: la sesión se crea por DB
    from sqlalchemy import select

    from app import models

    rid = make_routine(client)
    admin = db_session.scalar(select(models.User).where(models.User.username == "admin"))
    session = models.ScheduledSession(owner_id=admin.id, date=date.today(), routine_id=rid)
    db_session.add(session)
    db_session.commit()

    workout = client.post(
        "/api/v1/workouts", json={"scheduled_session_id": session.id}
    ).json()
    # hereda la rutina de la sesión y la enlaza como hecha
    assert workout["routine_id"] == rid
    db_session.expire_all()
    assert session.status == "done" and session.workout_id == workout["id"]

    # una sesión ya completada no se puede reutilizar
    client.post(f"/api/v1/workouts/{workout['id']}/finish")
    resp = client.post("/api/v1/workouts", json={"scheduled_session_id": session.id})
    assert resp.status_code == 409 and resp.json()["detail"] == "session_already_done"


def test_delete_workout_frees_its_scheduled_session(client: TestClient, db_session):
    from sqlalchemy import select

    from app import models

    rid = make_routine(client)
    admin = db_session.scalar(select(models.User).where(models.User.username == "admin"))
    session = models.ScheduledSession(owner_id=admin.id, date=date.today(), routine_id=rid)
    db_session.add(session)
    db_session.commit()

    workout = client.post(
        "/api/v1/workouts", json={"scheduled_session_id": session.id}
    ).json()

    assert client.delete(f"/api/v1/workouts/{workout['id']}").status_code == 204

    db_session.expire_all()
    refreshed = db_session.get(models.ScheduledSession, session.id)
    # v0.3.0 item 1: la sesión es de HOY, así que sigue el camino de siempre —
    # un "done" colgando sin workout bloquearía reutilizar la sesión
    assert refreshed.status == "planned" and refreshed.workout_id is None


def test_delete_workout_frees_a_future_scheduled_session(client: TestClient, db_session):
    from datetime import timedelta

    from sqlalchemy import select

    from app import models

    rid = make_routine(client)
    admin = db_session.scalar(select(models.User).where(models.User.username == "admin"))
    future_date = date.today() + timedelta(days=3)
    session = models.ScheduledSession(owner_id=admin.id, date=future_date, routine_id=rid)
    db_session.add(session)
    db_session.commit()

    workout = client.post(
        "/api/v1/workouts",
        json={"scheduled_session_id": session.id, "date": future_date.isoformat(), "finished": True},
    ).json()

    assert client.delete(f"/api/v1/workouts/{workout['id']}").status_code == 204

    db_session.expire_all()
    refreshed = db_session.get(models.ScheduledSession, session.id)
    assert refreshed.status == "planned" and refreshed.workout_id is None


def test_delete_workout_for_a_past_scheduled_session_deletes_it_entirely(client: TestClient, db_session):
    # v0.3.0 item 1 (bug): "Al borrar un entrenamiento anterior, se pone como
    # programado. Mal." — un "planned" en el pasado nunca se podrá "hacer"
    # retroactivamente, así que la sesión debe desaparecer entera, no revivir.
    from datetime import timedelta

    from sqlalchemy import select

    from app import models

    rid = make_routine(client)
    admin = db_session.scalar(select(models.User).where(models.User.username == "admin"))
    past_date = date.today() - timedelta(days=5)
    session = models.ScheduledSession(owner_id=admin.id, date=past_date, routine_id=rid)
    db_session.add(session)
    db_session.commit()
    session_id = session.id

    workout = client.post(
        "/api/v1/workouts",
        json={"scheduled_session_id": session_id, "date": past_date.isoformat(), "finished": True},
    ).json()

    assert client.delete(f"/api/v1/workouts/{workout['id']}").status_code == 204

    db_session.expire_all()
    assert db_session.get(models.ScheduledSession, session_id) is None


def test_patch_and_delete(client: TestClient, app):
    workout = client.post("/api/v1/workouts", json={"date": "2026-08-01"}).json()
    wid = workout["id"]
    resp = client.patch(f"/api/v1/workouts/{wid}", json={"note": "duro", "feeling": 4})
    assert resp.status_code == 200 and resp.json()["feeling"] == 4
    assert client.patch(f"/api/v1/workouts/{wid}", json={"feeling": 9}).status_code == 422

    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert freyja.get(f"/api/v1/workouts/{wid}").status_code == 404
    assert freyja.patch(f"/api/v1/workouts/{wid}", json={"note": "x"}).status_code == 404

    assert client.delete(f"/api/v1/workouts/{wid}").status_code == 204
    assert client.get(f"/api/v1/workouts/{wid}").status_code == 404


def test_stretched_defaults_false_and_patch_toggles_it(client: TestClient):
    workout = client.post("/api/v1/workouts", json={"date": "2026-08-01"}).json()
    wid = workout["id"]
    assert workout["stretched"] is False

    resp = client.patch(f"/api/v1/workouts/{wid}", json={"stretched": True})
    assert resp.status_code == 200 and resp.json()["stretched"] is True

    # una petición sin el campo no lo toca (exclude_unset)
    resp = client.patch(f"/api/v1/workouts/{wid}", json={"note": "x"})
    assert resp.json()["stretched"] is True

    resp = client.patch(f"/api/v1/workouts/{wid}", json={"stretched": False})
    assert resp.json()["stretched"] is False


def test_patch_workout_explicit_null_semantics(client: TestClient):
    workout = client.post("/api/v1/workouts", json={"date": "2026-08-01"}).json()
    wid = workout["id"]
    client.patch(f"/api/v1/workouts/{wid}", json={"note": "duro"})
    resp = client.patch(f"/api/v1/workouts/{wid}", json={"note": None})
    assert resp.status_code == 200 and resp.json()["note"] is None
    # date no es anulable: un null explícito no lo machaca
    resp = client.patch(f"/api/v1/workouts/{wid}", json={"date": None})
    assert resp.status_code == 200 and resp.json()["date"] == "2026-08-01"


def test_patch_exercise_note_is_noop_on_empty_body(client: TestClient):
    from tests.test_sets_api import start_with_exercise

    workout, wex = start_with_exercise(client)
    url = f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}"
    client.patch(url, json={"note": "custom"})
    resp = client.patch(url, json={})
    assert resp.status_code == 200 and resp.json()["note"] == "custom"
    resp = client.patch(url, json={"note": None})
    assert resp.status_code == 200 and resp.json()["note"] is None


def test_retro_workout_requires_date(client: TestClient):
    resp = client.post("/api/v1/workouts", json={"finished": True})
    assert resp.status_code == 422 and resp.json()["detail"] == "date_required"


def test_retro_workout_creates_finished_with_synthetic_timestamps(client: TestClient):
    resp = client.post(
        "/api/v1/workouts", json={"date": "2026-07-20", "finished": True}
    )
    assert resp.status_code == 201
    workout = resp.json()
    assert workout["date"] == "2026-07-20"
    # started==ended (duración desconocida): las stats no inflan tiempo de gym
    assert workout["started_at"] == workout["ended_at"] == "2026-07-20T12:00:00"


def test_retro_workout_works_while_another_workout_is_active(client: TestClient):
    active = client.post("/api/v1/workouts", json={}).json()

    resp = client.post(
        "/api/v1/workouts", json={"date": "2026-07-20", "finished": True}
    )
    assert resp.status_code == 201
    retro = resp.json()
    assert retro["id"] != active["id"]
    assert retro["ended_at"] is not None

    # el activo original sigue siéndolo: el retroactivo no lo pisó
    assert client.get("/api/v1/workouts/active").json()["id"] == active["id"]


def test_list_with_date_filters(client: TestClient):
    for day in ("2026-07-01", "2026-07-15", "2026-08-01"):
        wid = client.post("/api/v1/workouts", json={"date": day}).json()["id"]
        client.post(f"/api/v1/workouts/{wid}/finish")
    july = client.get("/api/v1/workouts?from_date=2026-07-01&to_date=2026-07-31").json()
    assert [w["date"] for w in july] == ["2026-07-15", "2026-07-01"]


# item 4 (round v0.3.0): grupos musculares derivados, ya no elegidos a mano
def test_muscle_tags_derive_from_exercises_and_recompute_on_add_remove(client: TestClient):
    chest = muscle_group_id(client, "chest")
    legs = muscle_group_id(client, "legs")
    workout = client.post("/api/v1/workouts", json={}).json()
    wid = workout["id"]
    assert workout["muscle_tag_ids"] == []

    bench_wex = client.post(
        f"/api/v1/workouts/{wid}/exercises", json={"exercise_id": bench_id(client)}
    ).json()
    assert client.get(f"/api/v1/workouts/{wid}").json()["muscle_tag_ids"] == [chest]

    client.post(
        f"/api/v1/workouts/{wid}/exercises", json={"exercise_id": exercise_id(client, "Squat")}
    )
    assert sorted(client.get(f"/api/v1/workouts/{wid}").json()["muscle_tag_ids"]) == sorted(
        [chest, legs]
    )

    # quitar el press banca deja solo el grupo del ejercicio que queda (legs)
    assert (
        client.delete(f"/api/v1/workouts/{wid}/exercises/{bench_wex['id']}").status_code == 204
    )
    assert client.get(f"/api/v1/workouts/{wid}").json()["muscle_tag_ids"] == [legs]


def test_muscle_tags_derived_immediately_from_routine_exercises(client: TestClient):
    chest = muscle_group_id(client, "chest")
    rid = make_routine(client)  # rutina "Push" con solo el press banca
    workout = client.post("/api/v1/workouts", json={"routine_id": rid}).json()
    assert workout["muscle_tag_ids"] == [chest]


# item 11 (round v0.3.0): descanso configurable por ejercicio del entreno
def test_rest_seconds_copied_from_routine_on_start_and_on_manual_add(client: TestClient):
    rid = make_routine(client)  # "Push" con bench a rest_seconds=90
    workout = client.post("/api/v1/workouts", json={"routine_id": rid}).json()
    assert workout["exercises"][0]["rest_seconds"] == 90

    # quitar y volver a añadir el mismo ejercicio (sigue en la rutina de origen)
    wid = workout["id"]
    client.delete(f"/api/v1/workouts/{wid}/exercises/{workout['exercises'][0]['id']}")
    added = client.post(
        f"/api/v1/workouts/{wid}/exercises", json={"exercise_id": bench_id(client)}
    ).json()
    assert added["rest_seconds"] == 90


def test_rest_seconds_is_null_for_ad_hoc_exercises(client: TestClient):
    workout = client.post("/api/v1/workouts", json={}).json()  # entreno libre, sin rutina
    added = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises", json={"exercise_id": bench_id(client)}
    ).json()
    assert added["rest_seconds"] is None


def test_rest_seconds_patch_round_trip_and_explicit_clear(client: TestClient):
    workout = client.post("/api/v1/workouts", json={}).json()
    wex = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises", json={"exercise_id": bench_id(client)}
    ).json()
    url = f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}"

    resp = client.patch(url, json={"rest_seconds": 120})
    assert resp.status_code == 200 and resp.json()["rest_seconds"] == 120

    # fuera de rango (ge=5, le=900)
    assert client.patch(url, json={"rest_seconds": 2}).status_code == 422

    # null explícito limpia el override (vuelve a caer al default en el frontend)
    resp = client.patch(url, json={"rest_seconds": None})
    assert resp.status_code == 200 and resp.json()["rest_seconds"] is None


def test_manual_muscle_tags_endpoint_superseded_by_next_exercise_change(client: TestClient):
    """El endpoint PUT .../muscle-groups sigue existiendo (compatibilidad),
    pero cualquier alta/baja de ejercicio posterior lo pisa con el derivado —
    deja de ser una fuente de verdad independiente."""
    chest = muscle_group_id(client, "chest")
    legs = muscle_group_id(client, "legs")
    workout = client.post("/api/v1/workouts", json={}).json()
    wid = workout["id"]

    manual = client.put(
        f"/api/v1/workouts/{wid}/muscle-groups", json={"muscle_group_ids": [legs]}
    ).json()
    assert manual["muscle_tag_ids"] == [legs]

    client.post(f"/api/v1/workouts/{wid}/exercises", json={"exercise_id": bench_id(client)})
    # el alta de un ejercicio de pecho reemplaza el tag manual de piernas
    assert client.get(f"/api/v1/workouts/{wid}").json()["muscle_tag_ids"] == [chest]
