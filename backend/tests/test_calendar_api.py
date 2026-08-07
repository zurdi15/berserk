from datetime import date

from fastapi.testclient import TestClient

from tests.conftest import login, make_user


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


def test_patch_status_away_from_done_clears_workout_link(client: TestClient, db_session):
    from sqlalchemy import select

    from app import models

    rid = client.post("/api/v1/routines", json={"name": "Push"}).json()["id"]
    admin = db_session.scalar(select(models.User).where(models.User.username == "admin"))
    session = models.ScheduledSession(owner_id=admin.id, date=date(2026, 8, 10), routine_id=rid)
    db_session.add(session)
    db_session.commit()

    workout = client.post(
        "/api/v1/workouts", json={"scheduled_session_id": session.id}
    ).json()

    # al salir de done el enlace al workout deja de ser cierto
    resp = client.patch(f"/api/v1/calendar/{session.id}", json={"status": "skipped"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "skipped" and body["workout_id"] is None
    assert workout["id"] is not None


def test_patch_explicit_null_detaches_routine(client: TestClient):
    rid = client.post("/api/v1/routines", json={"name": "Push"}).json()["id"]
    sid = client.post(
        "/api/v1/calendar", json={"date": "2026-08-12", "routine_id": rid, "note": "x"}
    ).json()["id"]
    resp = client.patch(f"/api/v1/calendar/{sid}", json={"routine_id": None, "note": None})
    assert resp.status_code == 200
    assert resp.json()["routine_id"] is None and resp.json()["note"] is None
    # null explícito sobre un campo no anulable no lo machaca
    resp = client.patch(f"/api/v1/calendar/{sid}", json={"date": None})
    assert resp.status_code == 200 and resp.json()["date"] == "2026-08-12"


def test_month_view_returns_target_workouts_to_a_shared_viewer(client: TestClient, app):
    """item 4 (v0.4.0, repro del bug real): "en el calendario no veo los dots
    de otro user al que le he compartido y me ha compartido". El test de la
    matriz de sharing (test_sharing_integration.py READ_PATHS) solo comprueba
    status 200 para /calendar/{y}/{m}?user_id=X, nunca el CONTENIDO — un
    workouts=[] vacío también pasaría ese assert. Este test fija que el
    resumen del mes trae de verdad los entrenos del target (no solo scheduled,
    que ya iba threaded) bajo sharing MUTUO (ambos se han compartido entre
    sí, el escenario exacto reportado) en ambas direcciones de vista.
    Root cause real (ver frontend/src/stores/athlete.ts): el backend ya
    filtraba workouts por target.id correctamente — lo que fallaba era que
    "viendo a X" no sobrevivía a una recarga en el frontend.
    """
    make_user(client, "freyja")
    admin_id = client.get("/api/v1/auth/me").json()["id"]

    admin_workout = client.post("/api/v1/workouts", json={"date": "2026-08-05"}).json()
    client.post(f"/api/v1/workouts/{admin_workout['id']}/finish")
    client.post("/api/v1/calendar", json={"date": "2026-08-10"})

    freyja = login(app, "freyja")
    freyja_id = freyja.get("/api/v1/auth/me").json()["id"]
    freyja_workout = freyja.post("/api/v1/workouts", json={"date": "2026-08-06"}).json()
    freyja.post(f"/api/v1/workouts/{freyja_workout['id']}/finish")

    # sharing MUTUO: admin -> freyja Y freyja -> admin
    assert client.post("/api/v1/sharing", json={"username": "freyja"}).status_code == 201
    assert freyja.post("/api/v1/sharing", json={"username": "admin"}).status_code == 201

    # freyja viendo a admin: debe ver el workout Y la sesión programada de admin
    month_for_freyja = freyja.get(f"/api/v1/calendar/2026/8?user_id={admin_id}").json()
    assert [w["id"] for w in month_for_freyja["workouts"]] == [admin_workout["id"]]
    assert [s["date"] for s in month_for_freyja["scheduled"]] == ["2026-08-10"]

    # admin viendo a freyja: debe ver el workout de freyja, no el suyo propio
    month_for_admin = client.get(f"/api/v1/calendar/2026/8?user_id={freyja_id}").json()
    assert [w["id"] for w in month_for_admin["workouts"]] == [freyja_workout["id"]]
    assert month_for_admin["scheduled"] == []
