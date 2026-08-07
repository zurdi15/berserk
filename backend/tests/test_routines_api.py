from fastapi.testclient import TestClient

from tests.conftest import login, make_user


def bench_id(client) -> int:
    return next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )


def squat_id(client) -> int:
    return next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Squat"
    )


def test_routine_crud_and_exercise_replacement(client: TestClient):
    resp = client.post(
        "/api/v1/routines", json={"name": "Push A", "rune": "ᚦ", "color": "ember"}
    )
    assert resp.status_code == 201
    rid = resp.json()["id"]
    assert resp.json()["exercises"] == []

    resp = client.put(
        f"/api/v1/routines/{rid}/exercises",
        json=[
            {"exercise_id": bench_id(client), "target_sets": 4, "target_reps": 8, "rest_seconds": 120},
            {"exercise_id": squat_id(client), "target_sets": 3},
        ],
    )
    assert resp.status_code == 200
    exercises = resp.json()["exercises"]
    assert [e["position"] for e in exercises] == [1, 2]
    assert exercises[0]["target_reps"] == 8

    # reemplazo reordena y elimina
    resp = client.put(
        f"/api/v1/routines/{rid}/exercises",
        json=[{"exercise_id": squat_id(client), "target_sets": 5}],
    )
    assert [e["exercise_id"] for e in resp.json()["exercises"]] == [squat_id(client)]

    resp = client.patch(f"/api/v1/routines/{rid}", json={"name": "Push B"})
    assert resp.json()["name"] == "Push B"
    assert client.delete(f"/api/v1/routines/{rid}").status_code == 204
    assert client.get(f"/api/v1/routines/{rid}").status_code == 404


def test_patch_explicit_null_semantics(client: TestClient):
    rid = client.post(
        "/api/v1/routines", json={"name": "Push", "rune": "ᚦ", "color": "ember"}
    ).json()["id"]
    resp = client.patch(f"/api/v1/routines/{rid}", json={"rune": None})
    assert resp.status_code == 200 and resp.json()["rune"] is None
    # name no es anulable: un null explícito no lo machaca
    resp = client.patch(f"/api/v1/routines/{rid}", json={"name": None})
    assert resp.status_code == 200 and resp.json()["name"] == "Push"


def test_routines_are_private(client: TestClient, app):
    rid = client.post("/api/v1/routines", json={"name": "Secreta"}).json()["id"]
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert freyja.get("/api/v1/routines").json() == []
    assert freyja.get(f"/api/v1/routines/{rid}").status_code == 404
    assert freyja.delete(f"/api/v1/routines/{rid}").status_code == 404


def test_put_exercises_rejects_invisible_exercise(client: TestClient, app):
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    chest = next(
        g["id"] for g in freyja.get("/api/v1/muscle-groups").json() if g["slug"] == "chest"
    )
    custom = freyja.post(
        "/api/v1/exercises",
        json={
            "name_es": "Mi press", "name_en": "My press", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
        },
    ).json()["id"]
    rid = client.post("/api/v1/routines", json={"name": "Push"}).json()["id"]
    resp = client.put(
        f"/api/v1/routines/{rid}/exercises", json=[{"exercise_id": custom, "target_sets": 3}]
    )
    assert resp.status_code == 422 and resp.json()["detail"] == "exercise_invalid"


# W2 feature 2: "un usuario puede compartir sus plantillas de rutinas con
# otros usuarios; los admin pueden crear plantillas globales para todos los
# usuarios" — is_public (compartir propia) + owner_id NULL (global admin,
# alcanzado vía POST .../globalize, nunca al crear, ver report v0.3.2)


def _routine_with_exercise(caller, name: str, exercise_id: int, *, is_public: bool = False) -> int:
    rid = caller.post("/api/v1/routines", json={"name": name}).json()["id"]
    if is_public:
        caller.patch(f"/api/v1/routines/{rid}", json={"is_public": True})
    caller.put(
        f"/api/v1/routines/{rid}/exercises", json=[{"exercise_id": exercise_id, "target_sets": 3}]
    )
    return rid


def test_private_routine_is_not_a_template_for_others(client: TestClient, app):
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    rid = _routine_with_exercise(freyja, "Privada", bench_id(client))

    make_user(client, "loki")
    loki = login(app, "loki")
    assert all(r["id"] != rid for r in loki.get("/api/v1/routines/templates").json())
    # tampoco copiable: 404, no filtra si existe
    assert loki.post(f"/api/v1/routines/{rid}/copy").status_code == 404


def test_public_routine_is_a_template_for_others_but_not_for_its_owner(client: TestClient, app):
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    rid = _routine_with_exercise(freyja, "Pública", bench_id(client), is_public=True)

    make_user(client, "loki")
    loki = login(app, "loki")
    templates = loki.get("/api/v1/routines/templates").json()
    listed = next(r for r in templates if r["id"] == rid)
    assert listed["owner_username"] == "freyja"

    # la propia dueña la ve en "mis rutinas" con su toggle, NUNCA duplicada
    # en su propia sección de plantillas (ya la ve arriba)
    assert any(r["id"] == rid for r in freyja.get("/api/v1/routines").json())
    assert all(r["id"] != rid for r in freyja.get("/api/v1/routines/templates").json())


# item 2 (v0.4.0): root-cause repro del bug de visibilidad reportado por
# zurdi con dos usuarios reales ("otro user no ve las rutinas que yo he
# marcado como públicas, ni tampoco ejercicios"). Verificado end-to-end
# (backend live vía HTTP + curl, no solo TestClient) que list_exercises/
# list_templates/PATCH is_public ya funcionan correctamente para dos usuarios
# NO-admin recién creados — ver también los tests de arriba y de
# test_exercises_api.py, que ya cubrían esto. El gap real que SÍ faltaba
# cubrir: un usuario marca su RUTINA pública sin marcar también cada
# ejercicio que contiene (nada en la UI lo exige antes de guardar) — la
# rutina es igualmente visible como plantilla (esto lo fija este test), y el
# frontend deja de renderizar un nombre en blanco para ese ejercicio (ver
# RoutineList.spec.ts "item 2" y RoutineList.vue resolvedExerciseName).
def test_public_routine_can_reference_an_exercise_the_owner_never_made_public(
    client: TestClient, app
):
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    chest = next(g["id"] for g in freyja.get("/api/v1/muscle-groups").json() if g["slug"] == "chest")
    private_exercise = freyja.post(
        "/api/v1/exercises",
        json={
            "name_es": "Privado", "name_en": "Private", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
        },
    ).json()["id"]
    rid = _routine_with_exercise(freyja, "Empuje", private_exercise, is_public=True)

    make_user(client, "loki")
    loki = login(app, "loki")

    # la RUTINA sigue siendo visible como plantilla, sin condiciones sobre
    # sus ejercicios — list_templates solo mira Routine.is_public
    templates = loki.get("/api/v1/routines/templates").json()
    listed = next(r for r in templates if r["id"] == rid)
    assert listed["exercises"][0]["exercise_id"] == private_exercise

    # pero el EJERCICIO en sí sigue siendo privado de freyja: no está en el
    # catálogo visible de loki (ni propio, ni global, ni público) — el
    # backend no filtra su nombre; es el frontend quien debe explicar la
    # ausencia en vez de dejar una fila muda (ver RoutineList.vue)
    assert all(e["id"] != private_exercise for e in loki.get("/api/v1/exercises").json())


def test_copy_creates_independent_routine_owned_by_copier(client: TestClient, app):
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    rid = _routine_with_exercise(freyja, "Pública", bench_id(client), is_public=True)

    make_user(client, "loki")
    loki = login(app, "loki")
    resp = loki.post(f"/api/v1/routines/{rid}/copy")
    assert resp.status_code == 201
    copy = resp.json()
    assert copy["id"] != rid
    assert copy["name"] == "Pública"
    assert copy["exercises"][0]["exercise_id"] == bench_id(client)

    # editable por loki (es suya de verdad, no una referencia viva)
    assert loki.patch(f"/api/v1/routines/{copy['id']}", json={"name": "Mi copia"}).status_code == 200

    # la fuente sigue intacta: sigue siendo de freyja, sin tocar
    source = freyja.get(f"/api/v1/routines/{rid}").json()
    assert source["name"] == "Pública" and source["is_public"] is True
    assert loki.get(f"/api/v1/routines/{rid}").status_code == 404  # loki nunca fue su dueño


def test_copy_dedupes_name_on_collision(client: TestClient, app):
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    rid = _routine_with_exercise(freyja, "Push", bench_id(client), is_public=True)

    make_user(client, "loki")
    loki = login(app, "loki")
    loki.post("/api/v1/routines", json={"name": "Push"})  # loki ya tiene una "Push"

    resp = loki.post(f"/api/v1/routines/{rid}/copy")
    assert resp.status_code == 201 and resp.json()["name"] == "Push (2)"

    # una tercera colisión sigue incrementando
    resp = loki.post(f"/api/v1/routines/{rid}/copy")
    assert resp.status_code == 201 and resp.json()["name"] == "Push (3)"


def test_copy_rejects_routine_with_exercises_private_to_copier(client: TestClient, app):
    # la rutina en sí es pública, pero uno de sus ejercicios es un custom
    # PRIVADO de freyja (nunca marcado is_public) — loki no puede verlo, así
    # que la copia entera se rechaza en vez de dejar un hueco silencioso
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    chest = next(g["id"] for g in freyja.get("/api/v1/muscle-groups").json() if g["slug"] == "chest")
    private_exercise = freyja.post(
        "/api/v1/exercises",
        json={
            "name_es": "Privado", "name_en": "Private", "measurement": "strength",
            "muscle_groups": [{"muscle_group_id": chest, "is_primary": True}],
        },
    ).json()["id"]
    rid = _routine_with_exercise(freyja, "Push", private_exercise, is_public=True)

    make_user(client, "loki")
    loki = login(app, "loki")
    resp = loki.post(f"/api/v1/routines/{rid}/copy")
    assert resp.status_code == 409 and resp.json()["detail"] == "routine_has_private_exercises"

    # si freyja hace público el ejercicio, la copia ya funciona
    freyja.patch(f"/api/v1/exercises/{private_exercise}", json={"is_public": True})
    resp = loki.post(f"/api/v1/routines/{rid}/copy")
    assert resp.status_code == 201


def test_globalize_is_admin_only_and_only_over_own_routine(client: TestClient, app):
    make_user(client, "freyja")
    freyja = login(app, "freyja")
    rid = freyja.post("/api/v1/routines", json={"name": "De freyja"}).json()["id"]

    # freyja (no admin) no puede globalizar ni la suya
    assert freyja.post(f"/api/v1/routines/{rid}/globalize").status_code == 403

    # el admin (client) no puede globalizar una rutina AJENA (404, no 403 —
    # ni siquiera confirma que existe)
    resp = client.post(f"/api/v1/routines/{rid}/globalize")
    assert resp.status_code == 404


def test_globalize_flow_leaves_owner_list_and_becomes_a_global_template(client: TestClient, app):
    rid = client.post("/api/v1/routines", json={"name": "Full body"}).json()["id"]
    resp = client.post(f"/api/v1/routines/{rid}/globalize")
    assert resp.status_code == 200
    body = resp.json()
    assert body["owner_id"] is None and body["owner_username"] is None

    # deja el listado personal del admin...
    assert all(r["id"] != rid for r in client.get("/api/v1/routines").json())
    # ...y aparece como plantilla GLOBAL para TODO el mundo, incluido el
    # propio admin (ya no es "suya" por ownership)
    assert any(r["id"] == rid for r in client.get("/api/v1/routines/templates").json())

    make_user(client, "freyja")
    freyja = login(app, "freyja")
    assert any(r["id"] == rid for r in freyja.get("/api/v1/routines/templates").json())

    # mirror de _can_edit: el admin sigue pudiendo editar/borrar la global,
    # un usuario normal sigue en 404 (nunca admin-de-lo-ajeno-que-ya-no-es-suyo)
    assert freyja.patch(f"/api/v1/routines/{rid}", json={"name": "Nope"}).status_code == 404
    assert client.patch(f"/api/v1/routines/{rid}", json={"name": "Full body v2"}).status_code == 200
    assert client.delete(f"/api/v1/routines/{rid}").status_code == 204
    assert all(r["id"] != rid for r in client.get("/api/v1/routines/templates").json())


def test_is_public_toggle_via_patch(client: TestClient):
    rid = client.post("/api/v1/routines", json={"name": "Toggle"}).json()["id"]
    assert client.get(f"/api/v1/routines/{rid}").json()["is_public"] is False

    resp = client.patch(f"/api/v1/routines/{rid}", json={"is_public": True})
    assert resp.status_code == 200 and resp.json()["is_public"] is True

    resp = client.patch(f"/api/v1/routines/{rid}", json={"is_public": False})
    assert resp.status_code == 200 and resp.json()["is_public"] is False
