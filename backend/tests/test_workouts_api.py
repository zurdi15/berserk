from datetime import date

from fastapi.testclient import TestClient

from tests.conftest import login, make_user


def bench_id(client) -> int:
    return next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )


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
    # un "done" colgando sin workout bloquearía reutilizar la sesión
    assert refreshed.status == "planned" and refreshed.workout_id is None


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


def test_list_with_date_filters(client: TestClient):
    for day in ("2026-07-01", "2026-07-15", "2026-08-01"):
        wid = client.post("/api/v1/workouts", json={"date": day}).json()["id"]
        client.post(f"/api/v1/workouts/{wid}/finish")
    july = client.get("/api/v1/workouts?from_date=2026-07-01&to_date=2026-07-31").json()
    assert [w["date"] for w in july] == ["2026-07-15", "2026-07-01"]
