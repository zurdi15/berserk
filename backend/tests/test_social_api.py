"""v0.12.0 — feed social: eventos de quienes comparten conmigo + comparativa."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from tests.conftest import login, make_user


def _train(client: TestClient, day: str, weight: float = 100):
    bench = next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )
    workout = client.post("/api/v1/workouts", json={"date": day}).json()
    wex = client.post(
        f"/api/v1/workouts/{workout['id']}/exercises", json={"exercise_id": bench}
    ).json()
    client.post(
        f"/api/v1/workouts/{workout['id']}/exercises/{wex['id']}/sets",
        json={"reps": 5, "weight_kg": weight},
    )
    client.post(f"/api/v1/workouts/{workout['id']}/finish")


def test_feed_events_and_comparison(client: TestClient, app):
    today = date.today()
    _train(client, today.isoformat(), weight=100)
    make_user(client, "freyja")
    make_user(client, "loki")
    client.post("/api/v1/sharing", json={"username": "freyja"})

    # freyja RECIBE el sharing del admin: su feed lleva el entreno de hoy
    freyja = login(app, "freyja")
    feed = freyja.get("/api/v1/social/feed").json()
    assert len(feed["events"]) == 1
    event = feed["events"][0]
    assert event["user"]["username"] == "admin"
    assert event["date"] == today.isoformat()
    assert event["volume_kg"] == 500.0
    assert event["pr_count"] >= 1
    assert "Pecho" in event["muscle_groups_es"]

    # comparativa: yo primero (is_me), luego quienes comparten conmigo
    rows = feed["comparison"]
    assert [r["is_me"] for r in rows] == [True, False]
    me, admin_row = rows
    assert me["user"]["username"] == "freyja" and me["week_workouts"] == 0
    assert admin_row["user"]["username"] == "admin"
    assert admin_row["week_workouts"] == 1
    assert admin_row["week_volume_kg"] == 500.0
    assert admin_row["streak_weeks"] >= 1

    # eventos fuera de la ventana de 7 días no aparecen
    _train(client, (today - timedelta(days=30)).isoformat())
    feed = freyja.get("/api/v1/social/feed").json()
    assert len(feed["events"]) == 1

    # loki no recibe nada: feed vacío y comparativa solo consigo mismo
    loki = login(app, "loki")
    feed = loki.get("/api/v1/social/feed").json()
    assert feed["events"] == []
    assert len(feed["comparison"]) == 1 and feed["comparison"][0]["is_me"] is True


def test_feed_requires_session(anon: TestClient):
    assert anon.get("/api/v1/social/feed").status_code == 401
