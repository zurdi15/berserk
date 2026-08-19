from datetime import date

from fastapi.testclient import TestClient

from tests.conftest import login, make_user


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


def test_month_view_returns_target_workouts_to_a_shared_viewer(client: TestClient, app):
    """item 4 (v0.4.0, repro del bug real): "en el calendario no veo los dots
    de otro user al que le he compartido y me ha compartido". El test de la
    matriz de sharing (test_sharing_integration.py READ_PATHS) solo comprueba
    status 200 para /calendar/{y}/{m}?user_id=X, nunca el CONTENIDO — un
    workouts=[] vacío también pasaría ese assert. Este test fija que el
    resumen del mes trae de verdad los entrenos del target (no un
    workouts=[] vacío) bajo sharing MUTUO (ambos se han compartido entre
    sí, el escenario exacto reportado) en ambas direcciones de vista.
    Root cause real (ver frontend/src/stores/athlete.ts): el backend ya
    filtraba workouts por target.id correctamente — lo que fallaba era que
    "viendo a X" no sobrevivía a una recarga en el frontend.
    """
    make_user(client, "freyja")
    admin_id = client.get("/api/v1/auth/me").json()["id"]

    admin_workout = client.post("/api/v1/workouts", json={"date": "2026-08-05"}).json()
    client.post(f"/api/v1/workouts/{admin_workout['id']}/finish")

    freyja = login(app, "freyja")
    freyja_id = freyja.get("/api/v1/auth/me").json()["id"]
    freyja_workout = freyja.post("/api/v1/workouts", json={"date": "2026-08-06"}).json()
    freyja.post(f"/api/v1/workouts/{freyja_workout['id']}/finish")

    # sharing MUTUO: admin -> freyja Y freyja -> admin
    assert client.post("/api/v1/sharing", json={"username": "freyja"}).status_code == 201
    assert freyja.post("/api/v1/sharing", json={"username": "admin"}).status_code == 201

    # freyja viendo a admin: debe ver el workout de admin
    month_for_freyja = freyja.get(f"/api/v1/calendar/2026/8?user_id={admin_id}").json()
    assert [w["id"] for w in month_for_freyja["workouts"]] == [admin_workout["id"]]

    # admin viendo a freyja: debe ver el workout de freyja, no el suyo propio
    month_for_admin = client.get(f"/api/v1/calendar/2026/8?user_id={freyja_id}").json()
    assert [w["id"] for w in month_for_admin["workouts"]] == [freyja_workout["id"]]


def test_month_view_shared_overlay_matrix(client: TestClient, app):
    """SHARED-DOTS OVERLAY (v0.4.1, pivote de producto de zurdi): "quiero que
    EN MI PROPIO calendario salgan los puntitos de los otros users, no tener
    que verlo en su perfil". Matriz end-to-end sobre `shared` en
    GET /calendar/{y}/{m}: solo aparece el que me ha CONCEDIDO acceso
    (ShareGrant owner->yo, dirección exacta de resolve_target_user), con sus
    días de entreno terminado; nadie más se filtra (loki no comparte
    conmigo); revocar el grant lo hace desaparecer; y en modo atleta el campo
    entero se OMITE del JSON (nunca "shared": [] ni "shared": null) — ahí ya
    se está en la vista de otro, el overlay ambient no aplica.
    """
    make_user(client, "freyja")
    make_user(client, "loki")
    admin_id = client.get("/api/v1/auth/me").json()["id"]

    freyja = login(app, "freyja")
    freyja_id = freyja.get("/api/v1/auth/me").json()["id"]
    freyja_workout = freyja.post("/api/v1/workouts", json={"date": "2026-08-05"}).json()
    freyja.post(f"/api/v1/workouts/{freyja_workout['id']}/finish")

    # loki tiene un entreno terminado pero NUNCA me concede acceso: no debe
    # filtrarse a mi shared bajo ninguna circunstancia
    loki = login(app, "loki")
    loki_workout = loki.post("/api/v1/workouts", json={"date": "2026-08-06"}).json()
    loki.post(f"/api/v1/workouts/{loki_workout['id']}/finish")

    assert freyja.post("/api/v1/sharing", json={"username": "admin"}).status_code == 201

    month = client.get("/api/v1/calendar/2026/8").json()
    assert [s["username"] for s in month["shared"]] == ["freyja"]
    shared_entry = month["shared"][0]
    assert shared_entry["user_id"] == freyja_id
    assert shared_entry["dates"] == ["2026-08-05"]
    assert set(shared_entry.keys()) == {"user_id", "username", "color", "dates"}

    # modo atleta: viendo a freyja (grant mutuo asumido no hace falta, freyja
    # ya me ha compartido A MÍ) — el campo entero desaparece del JSON
    athlete_view_resp = client.get(f"/api/v1/calendar/2026/8?user_id={freyja_id}")
    assert athlete_view_resp.status_code == 200
    assert "shared" not in athlete_view_resp.json()

    # revocación: freyja (dueña del grant) revoca el acceso del admin (viewer)
    # -> deja de aparecer en el propio shared del admin
    assert freyja.delete(f"/api/v1/sharing/{admin_id}").status_code == 204
    month_after_revoke = client.get("/api/v1/calendar/2026/8").json()
    assert month_after_revoke["shared"] == []
