from fastapi.testclient import TestClient

from tests.conftest import login, make_user


def group_id(client, slug):
    groups = client.get("/api/v1/muscle-groups").json()
    return next(g["id"] for g in groups if g["slug"] == slug)


def test_seeded_catalog_visible(client: TestClient):
    groups = client.get("/api/v1/muscle-groups").json()
    assert {g["slug"] for g in groups} >= {"chest", "back", "legs", "core"}
    exercises = client.get("/api/v1/exercises").json()
    assert any(e["name_en"] == "Bench press" for e in exercises)
    bench = next(e for e in exercises if e["name_en"] == "Bench press")
    assert sum(1 for l in bench["muscle_groups"] if l["is_primary"]) == 1


def test_exercise_filters(client: TestClient):
    legs = group_id(client, "legs")
    filtered = client.get(f"/api/v1/exercises?muscle_group_id={legs}").json()
    assert filtered and all(
        any(l["muscle_group_id"] == legs for l in e["muscle_groups"]) for e in filtered
    )
    cardio = client.get("/api/v1/exercises?measurement=cardio").json()
    assert cardio and all(e["measurement"] == "cardio" for e in cardio)
    search = client.get("/api/v1/exercises?q=sentadilla").json()
    assert any("Sentadilla" in e["name_es"] for e in search)


def test_custom_muscle_group_lifecycle(client: TestClient, app):
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    resp = freyja.post(
        "/api/v1/muscle-groups",
        json={"slug": "glutes", "name_es": "Glúteos", "name_en": "Glutes"},
    )
    assert resp.status_code == 201
    gid = resp.json()["id"]
    # privado: el admin no lo ve
    assert all(g["slug"] != "glutes" for g in client.get("/api/v1/muscle-groups").json())
    # slug duplicado dentro del mismo scope
    resp = freyja.post(
        "/api/v1/muscle-groups",
        json={"slug": "glutes", "name_es": "Glúteos", "name_en": "Glutes"},
    )
    assert resp.status_code == 409 and resp.json()["detail"] == "slug_taken"
    # global solo admin
    resp = freyja.post(
        "/api/v1/muscle-groups",
        json={"slug": "forearms", "name_es": "Antebrazos", "name_en": "Forearms", "is_global": True},
    )
    assert resp.status_code == 403
    assert freyja.delete(f"/api/v1/muscle-groups/{gid}").status_code == 204


def test_delete_group_in_use_conflict(client: TestClient, app):
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    gid = freyja.post(
        "/api/v1/muscle-groups",
        json={"slug": "glutes", "name_es": "Glúteos", "name_en": "Glutes"},
    ).json()["id"]
    freyja.post(
        "/api/v1/exercises",
        json={
            "name_es": "Patada de glúteo", "name_en": "Glute kickback",
            "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": gid, "is_primary": True}],
        },
    )
    resp = freyja.delete(f"/api/v1/muscle-groups/{gid}")
    assert resp.status_code == 409 and resp.json()["detail"] == "muscle_group_in_use"


def test_custom_exercise_lifecycle(client: TestClient, app):
    chest = group_id(client, "chest")
    resp = client.post(
        "/api/v1/exercises",
        json={
            "name_es": "Press raro", "name_en": "Weird press", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
        },
    )
    assert resp.status_code == 201
    eid = resp.json()["id"]
    # dos primarios -> 422
    assert client.post(
        "/api/v1/exercises",
        json={
            "name_es": "X", "name_en": "X", "measurement": "strength",
            "muscle_groups": [
                {"muscle_group_id": chest, "is_primary": True},
                {"muscle_group_id": group_id(client, "back"), "is_primary": True},
            ],
        },
    ).status_code == 422
    # grupo inexistente -> 422
    resp = client.post(
        "/api/v1/exercises",
        json={
            "name_es": "Y", "name_en": "Y", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": 99999, "is_primary": True}],
        },
    )
    assert resp.status_code == 422 and resp.json()["detail"] == "muscle_group_invalid"
    # patch renombra y reetiqueta
    resp = client.patch(
        f"/api/v1/exercises/{eid}",
        json={"name_en": "Weirder press",
              "muscle_groups": [{"muscle_group_id": group_id(client, "back"), "is_primary": True}]},
    )
    assert resp.status_code == 200 and resp.json()["name_en"] == "Weirder press"
    # los globales son inmutables para un usuario normal (404: no son tuyos)
    # — un admin SÍ puede (item 5, ver test_admin_can_edit_global_exercise)
    exercises = client.get("/api/v1/exercises").json()
    bench = next(e for e in exercises if e["name_en"] == "Bench press")
    make_user(client, "loki")
    loki = login(app, "loki")
    assert loki.patch(f"/api/v1/exercises/{bench['id']}", json={"name_en": "Nope"}).status_code == 404
    assert loki.delete(f"/api/v1/exercises/{bench['id']}").status_code == 404
    # otro usuario no ve ni toca mi custom
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert all(e["id"] != eid for e in freyja.get("/api/v1/exercises").json())
    assert freyja.delete(f"/api/v1/exercises/{eid}").status_code == 404
    assert client.delete(f"/api/v1/exercises/{eid}").status_code == 204


def test_delete_exercise_in_use_conflict(client: TestClient, db_session):
    from datetime import date as date_cls

    from sqlalchemy import select

    from app import models

    chest = group_id(client, "chest")
    eid = client.post(
        "/api/v1/exercises",
        json={
            "name_es": "Press raro", "name_en": "Weird press", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
        },
    ).json()["id"]
    admin = db_session.scalar(select(models.User).where(models.User.username == "admin"))
    workout = models.Workout(owner_id=admin.id, date=date_cls(2026, 8, 5))
    db_session.add(workout)
    db_session.flush()
    db_session.add(models.WorkoutExercise(workout_id=workout.id, exercise_id=eid, position=1))
    db_session.commit()
    resp = client.delete(f"/api/v1/exercises/{eid}")
    assert resp.status_code == 409 and resp.json()["detail"] == "exercise_in_use"


def test_create_global_exercise_admin_only(client: TestClient, app):
    # item 3: is_global=True crea owner_id NULL, visible a todos — solo admin
    chest = group_id(client, "chest")
    resp = client.post(
        "/api/v1/exercises",
        json={
            "name_es": "Press del clan", "name_en": "Clan press", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
            "is_global": True,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["owner_id"] is None

    make_user(client, "freyja")
    freyja = login(app, "freyja")
    # freyja lo ve (global) pese a no haberlo creado
    assert any(e["id"] == body["id"] for e in freyja.get("/api/v1/exercises").json())
    resp = freyja.post(
        "/api/v1/exercises",
        json={
            "name_es": "X", "name_en": "X", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
            "is_global": True,
        },
    )
    assert resp.status_code == 403 and resp.json()["detail"] == "admin_only"


def test_admin_can_edit_and_delete_global_exercise(client: TestClient, app):
    # item 5: un admin puede editar/borrar filas del catálogo predefinido
    # (owner_id NULL); un usuario normal sigue viendo 404 (no son suyas)
    exercises = client.get("/api/v1/exercises").json()
    bench = next(e for e in exercises if e["name_en"] == "Bench press")

    resp = client.patch(f"/api/v1/exercises/{bench['id']}", json={"name_en": "Bench press v2"})
    assert resp.status_code == 200 and resp.json()["name_en"] == "Bench press v2"
    assert resp.json()["owner_id"] is None

    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert freyja.patch(f"/api/v1/exercises/{bench['id']}", json={"name_en": "Nope"}).status_code == 404
    assert freyja.delete(f"/api/v1/exercises/{bench['id']}").status_code == 404

    assert client.delete(f"/api/v1/exercises/{bench['id']}").status_code == 204
    assert all(e["id"] != bench["id"] for e in client.get("/api/v1/exercises").json())


def test_admin_can_update_and_delete_global_muscle_group(client: TestClient, app):
    # item 5: PATCH no existía para grupos musculares; admin puede editar
    # nombre y "runa" (slug) de un grupo predefinido, y borrarlo (con la
    # guarda de uso 409 intacta) — un usuario normal ve 404 en ambos casos
    legs = group_id(client, "legs")

    resp = client.patch(
        f"/api/v1/muscle-groups/{legs}",
        json={"name_es": "Piernas y glúteos", "name_en": "Legs and glutes"},
    )
    assert resp.status_code == 200
    assert resp.json()["name_es"] == "Piernas y glúteos"
    assert resp.json()["owner_id"] is None

    # slug libre -> aceptado (esto es lo que hace el picker de runas: cambia
    # el slug a otro nombre de runa válido)
    resp = client.patch(f"/api/v1/muscle-groups/{legs}", json={"slug": "quads"})
    assert resp.status_code == 200 and resp.json()["slug"] == "quads"

    # slug ya usado por otro grupo global -> 409
    chest = group_id(client, "chest")
    resp = client.patch(f"/api/v1/muscle-groups/{chest}", json={"slug": "quads"})
    assert resp.status_code == 409 and resp.json()["detail"] == "slug_taken"

    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert freyja.patch(f"/api/v1/muscle-groups/{legs}", json={"name_es": "Nope"}).status_code == 404
    assert freyja.delete(f"/api/v1/muscle-groups/{legs}").status_code == 404

    # "legs" (ahora "quads") está en uso por el catálogo sembrado, así que
    # para probar el borrado admin de una fila global se usa un grupo global
    # nuevo y vacío, no "legs" (eso ya cubre el 409 en el test siguiente)
    empty_global = client.post(
        "/api/v1/muscle-groups",
        json={"slug": "forearms", "name_es": "Antebrazos", "name_en": "Forearms", "is_global": True},
    ).json()
    assert freyja.delete(f"/api/v1/muscle-groups/{empty_global['id']}").status_code == 404
    assert client.delete(f"/api/v1/muscle-groups/{empty_global['id']}").status_code == 204
    remaining = client.get("/api/v1/muscle-groups").json()
    assert all(g["id"] != empty_global["id"] for g in remaining)
    assert any(g["slug"] == "quads" for g in remaining)


def test_admin_delete_global_muscle_group_in_use_conflict(client: TestClient):
    # la guarda 409 sigue aplicando incluso para un admin sobre una fila global
    chest = group_id(client, "chest")
    exercises = client.get("/api/v1/exercises").json()
    assert any(
        l["muscle_group_id"] == chest for e in exercises for l in e["muscle_groups"]
    )
    resp = client.delete(f"/api/v1/muscle-groups/{chest}")
    assert resp.status_code == 409 and resp.json()["detail"] == "muscle_group_in_use"
