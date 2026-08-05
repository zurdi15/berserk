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
    # los globales son inmutables (404: no son tuyos)
    exercises = client.get("/api/v1/exercises").json()
    bench = next(e for e in exercises if e["name_en"] == "Bench press")
    assert client.patch(f"/api/v1/exercises/{bench['id']}", json={"name_en": "Nope"}).status_code == 404
    assert client.delete(f"/api/v1/exercises/{bench['id']}").status_code == 404
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
