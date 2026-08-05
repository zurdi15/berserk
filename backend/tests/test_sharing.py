import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import models
from app.permissions import resolve_target_user
from tests.conftest import login, make_user


def test_grant_and_list_both_sides(client: TestClient, app):
    make_user(client, "freyja")
    resp = client.post("/api/v1/sharing", json={"username": "freyja"})
    assert resp.status_code == 201
    mine = client.get("/api/v1/sharing").json()
    assert [u["username"] for u in mine["given"]] == ["freyja"]
    assert mine["received"] == []
    freyja = login(app, "freyja")
    theirs = freyja.get("/api/v1/sharing").json()
    assert [u["username"] for u in theirs["received"]] == ["admin"]


def test_grant_errors(client: TestClient):
    assert client.post("/api/v1/sharing", json={"username": "ghost"}).status_code == 404
    resp = client.post("/api/v1/sharing", json={"username": "admin"})
    assert resp.status_code == 409
    assert resp.json()["detail"] == "cannot_share_self"
    make_user(client, "freyja")
    client.post("/api/v1/sharing", json={"username": "freyja"})
    resp = client.post("/api/v1/sharing", json={"username": "freyja"})
    assert resp.status_code == 409
    assert resp.json()["detail"] == "already_shared"


def test_revoke(client: TestClient):
    freyja = make_user(client, "freyja")
    client.post("/api/v1/sharing", json={"username": "freyja"})
    assert client.delete(f"/api/v1/sharing/{freyja['id']}").status_code == 204
    assert client.get("/api/v1/sharing").json()["given"] == []
    assert client.delete(f"/api/v1/sharing/{freyja['id']}").status_code == 404


def test_resolve_target_user(client: TestClient, db_session):
    # directo contra la dependencia: los endpoints que la usan llegan en tareas posteriores
    admin = db_session.scalar(select(models.User).where(models.User.username == "admin"))
    freyja_id = make_user(client, "freyja")["id"]
    freyja = db_session.get(models.User, freyja_id)

    assert resolve_target_user(user=admin, db=db_session, user_id=None) is admin
    assert resolve_target_user(user=admin, db=db_session, user_id=admin.id) is admin
    with pytest.raises(HTTPException) as exc:
        resolve_target_user(user=admin, db=db_session, user_id=freyja.id)
    assert exc.value.status_code == 404 and exc.value.detail == "not_found"

    # user_id inexistente: mismo 404 que sin grant (no filtra existencia)
    with pytest.raises(HTTPException) as exc:
        resolve_target_user(user=admin, db=db_session, user_id=99999)
    assert exc.value.status_code == 404 and exc.value.detail == "not_found"

    db_session.add(models.ShareGrant(owner_id=freyja.id, viewer_id=admin.id))
    db_session.commit()
    assert resolve_target_user(user=admin, db=db_session, user_id=freyja.id).id == freyja.id
    # el grant es unidireccional: freyja no ve al admin
    with pytest.raises(HTTPException):
        resolve_target_user(user=freyja, db=db_session, user_id=admin.id)
