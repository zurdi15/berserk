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


def test_create_muscle_group_with_rune(client: TestClient, app):
    # item 14: runa dedicada, libre de la restricción slug==nombre_de_runa
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    resp = freyja.post(
        "/api/v1/muscle-groups",
        json={"slug": "glutes", "name_es": "Glúteos", "name_en": "Glutes", "rune": "core"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["slug"] == "glutes" and body["rune"] == "core"

    # backend permisivo a propósito: no valida contra el diccionario RUNES
    # del frontend, cualquier string cabe (hasta 30 chars)
    resp = freyja.post(
        "/api/v1/muscle-groups",
        json={"slug": "forearms", "name_es": "Antebrazos", "name_en": "Forearms", "rune": "not-a-real-rune"},
    )
    assert resp.status_code == 201 and resp.json()["rune"] == "not-a-real-rune"


def test_create_muscle_group_without_rune_defaults_to_none(client: TestClient):
    resp = client.post(
        "/api/v1/muscle-groups",
        json={"slug": "calves", "name_es": "Gemelos", "name_en": "Calves"},
    )
    assert resp.status_code == 201 and resp.json()["rune"] is None


def test_owner_edits_own_group_rune(client: TestClient, app):
    # item 14 (bug de zurdi): el botón de editar estaba gateado al revés
    # (solo grupos globales); el dueño de un grupo PROPIO debe poder editar
    # su runa igual que un admin edita una global — esto ya lo permitía
    # _can_edit, este test lo deja explícito y a prueba de regresión
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    gid = freyja.post(
        "/api/v1/muscle-groups",
        json={"slug": "glutes", "name_es": "Glúteos", "name_en": "Glutes"},
    ).json()["id"]

    resp = freyja.patch(f"/api/v1/muscle-groups/{gid}", json={"rune": "legs"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["rune"] == "legs" and body["slug"] == "glutes"  # slug intacto

    # slug sigue siendo tocable a nivel de API (el frontend deja de
    # exponerlo, pero el backend no lo prohíbe, ver MuscleGroupPatchIn)
    resp = freyja.patch(f"/api/v1/muscle-groups/{gid}", json={"rune": None})
    assert resp.status_code == 200 and resp.json()["rune"] is None


def test_admin_cannot_edit_other_users_own_group(client: TestClient, app):
    # _can_edit es owner-o-admin-de-global, NUNCA admin-de-lo-ajeno: un
    # grupo PRIVADO de otro usuario sigue siendo 404 para el admin
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    gid = freyja.post(
        "/api/v1/muscle-groups",
        json={"slug": "glutes", "name_es": "Glúteos", "name_en": "Glutes"},
    ).json()["id"]

    resp = client.patch(f"/api/v1/muscle-groups/{gid}", json={"rune": "legs"})
    assert resp.status_code == 404


def test_admin_patches_global_group_rune(client: TestClient, app):
    legs = group_id(client, "legs")
    resp = client.patch(f"/api/v1/muscle-groups/{legs}", json={"rune": "core"})
    assert resp.status_code == 200 and resp.json()["rune"] == "core"

    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert freyja.patch(f"/api/v1/muscle-groups/{legs}", json={"rune": "chest"}).status_code == 404


def test_admin_delete_global_muscle_group_in_use_conflict(client: TestClient):
    # la guarda 409 sigue aplicando incluso para un admin sobre una fila global
    chest = group_id(client, "chest")
    exercises = client.get("/api/v1/exercises").json()
    assert any(
        l["muscle_group_id"] == chest for e in exercises for l in e["muscle_groups"]
    )
    resp = client.delete(f"/api/v1/muscle-groups/{chest}")
    assert resp.status_code == 409 and resp.json()["detail"] == "muscle_group_in_use"


# W2 feature 1: "los ejercicios que añade un user que tengan un check de
# globales para que otros usuarios puedan verlos" — is_public en un
# ejercicio PROPIO (owner_id sigue siendo el creador, distinto del catálogo
# admin is_global/owner_id NULL, ver test_create_global_exercise_admin_only)


def test_own_exercise_defaults_private_and_invisible_to_others(client: TestClient, app):
    chest = group_id(client, "chest")
    eid = client.post(
        "/api/v1/exercises",
        json={
            "name_es": "Secreto", "name_en": "Secret", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
        },
    ).json()["id"]
    # is_public no viajó en el payload -> default False (ExerciseIn)
    created = next(e for e in client.get("/api/v1/exercises").json() if e["id"] == eid)
    assert created["is_public"] is False

    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert all(e["id"] != eid for e in freyja.get("/api/v1/exercises").json())
    # tampoco usable: no lo ve, así que no puede meterlo en una rutina suya
    rid = freyja.post("/api/v1/routines", json={"name": "Push"}).json()["id"]
    resp = freyja.put(
        f"/api/v1/routines/{rid}/exercises", json=[{"exercise_id": eid, "target_sets": 3}]
    )
    assert resp.status_code == 422 and resp.json()["detail"] == "exercise_invalid"


def test_public_exercise_visible_usable_but_not_editable_by_others(client: TestClient, app):
    # dueño (freyja) crea un ejercicio PROPIO marcado is_public
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    chest = group_id(client, "chest")
    eid = freyja.post(
        "/api/v1/exercises",
        json={
            "name_es": "Press comunitario", "name_en": "Community press", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
            "is_public": True,
        },
    ).json()["id"]

    make_user(client, "loki")
    loki = login(app, "loki")
    # VISIBLE: aparece en el listado de CUALQUIER otro usuario, con atribución
    listed = next(e for e in loki.get("/api/v1/exercises").json() if e["id"] == eid)
    assert listed["is_public"] is True
    assert listed["owner_username"] == "freyja"

    # USABLE: loki puede añadirlo a SU rutina (get_visible_exercise honra is_public)
    rid = loki.post("/api/v1/routines", json={"name": "Push"}).json()["id"]
    resp = loki.put(
        f"/api/v1/routines/{rid}/exercises", json=[{"exercise_id": eid, "target_sets": 3}]
    )
    assert resp.status_code == 200
    assert resp.json()["exercises"][0]["exercise_id"] == eid

    # NO EDITABLE: ni loki ni el admin (client) pueden tocar lo público de OTRO
    assert loki.patch(f"/api/v1/exercises/{eid}", json={"name_en": "Nope"}).status_code == 404
    assert loki.delete(f"/api/v1/exercises/{eid}").status_code == 404
    assert client.patch(f"/api/v1/exercises/{eid}", json={"name_en": "Nope"}).status_code == 404
    assert client.delete(f"/api/v1/exercises/{eid}").status_code == 404

    # el dueño SIGUE pudiendo editar y borrar lo suyo, público o no
    resp = freyja.patch(f"/api/v1/exercises/{eid}", json={"name_en": "Community press v2"})
    assert resp.status_code == 200 and resp.json()["name_en"] == "Community press v2"


def test_is_public_toggle_round_trip_changes_visibility(client: TestClient, app):
    chest = group_id(client, "chest")
    eid = client.post(
        "/api/v1/exercises",
        json={
            "name_es": "Toggle", "name_en": "Toggle", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
        },
    ).json()["id"]

    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert all(e["id"] != eid for e in freyja.get("/api/v1/exercises").json())

    # PATCH is_public=True (checkbox marcado en edición) -> visible
    resp = client.patch(f"/api/v1/exercises/{eid}", json={"is_public": True})
    assert resp.status_code == 200 and resp.json()["is_public"] is True
    assert any(e["id"] == eid for e in freyja.get("/api/v1/exercises").json())

    # PATCH is_public=False (desmarcado) -> vuelve a ser invisible
    resp = client.patch(f"/api/v1/exercises/{eid}", json={"is_public": False})
    assert resp.status_code == 200 and resp.json()["is_public"] is False
    assert all(e["id"] != eid for e in freyja.get("/api/v1/exercises").json())

    # patch sin is_public (omitido, no False explícito) no lo toca
    resp = client.patch(f"/api/v1/exercises/{eid}", json={"is_public": True})
    assert resp.json()["is_public"] is True
    resp = client.patch(f"/api/v1/exercises/{eid}", json={"name_en": "Toggle v2"})
    assert resp.status_code == 200 and resp.json()["is_public"] is True


def test_catalog_rows_carry_no_owner_username(client: TestClient):
    # owner_username es None para el catálogo admin (owner_id NULL) — la
    # atribución del frontend solo tiene sentido cuando hay un dueño de verdad
    bench = next(e for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press")
    assert bench["owner_id"] is None
    assert bench["owner_username"] is None


def test_create_exercise_without_english_name(client: TestClient):
    # v0.19.x (zurdi): name_en es opcional — se guarda '' y el cliente cae
    # al name_es cuando la app está en inglés
    chest = group_id(client, "chest")
    resp = client.post(
        "/api/v1/exercises",
        json={
            "name_es": "Press inventado", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
        },
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["name_en"] == ""

    # el patch con '' explícito BORRA la traducción; None (omitir) no toca
    eid = created["id"]
    assert client.patch(
        f"/api/v1/exercises/{eid}", json={"name_en": "Made-up press"}
    ).status_code == 200
    assert client.patch(f"/api/v1/exercises/{eid}", json={"name_en": ""}).status_code == 200
    listed = next(e for e in client.get("/api/v1/exercises").json() if e["id"] == eid)
    assert listed["name_en"] == ""
