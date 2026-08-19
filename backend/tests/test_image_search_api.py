"""v0.24.0 — búsqueda e importación de imágenes de ejercicio.

La red se monkeypatchea entera (_fetch_url): los tests jamás salen a
internet. El PNG es el mismo 1x1 válido de test_media_api.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.routers import image_search

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082"
)

FAKE_INDEX = [
    {"name": "Barbell Bench Press", "images": ["Barbell_Bench_Press/0.jpg", "Barbell_Bench_Press/1.jpg"]},
    {"name": "Incline Dumbbell Press", "images": ["Incline_Dumbbell_Press/0.jpg"]},
    {"name": "Air Bike", "images": ["Air_Bike/0.jpg"]},
    {"name": "Sin Imagenes", "images": []},
]


@pytest.fixture(autouse=True)
def fake_network(monkeypatch):
    def fetch(url: str) -> bytes:
        if url == image_search.INDEX_URL:
            return json.dumps(FAKE_INDEX).encode()
        if url.startswith(image_search.IMAGE_BASE):
            return PNG
        raise AssertionError(f"URL inesperada: {url}")

    monkeypatch.setattr(image_search, "_fetch_url", fetch)
    # cache limpia por test: el TTL de 6h contaminaría entre tests
    monkeypatch.setattr(image_search, "_index_cache", {"at": 0.0, "items": []})


def _bench(client: TestClient) -> int:
    return next(
        e["id"] for e in client.get("/api/v1/exercises").json() if e["name_en"] == "Bench press"
    )


def test_search_matches_by_folded_substring(client: TestClient):
    results = client.get("/api/v1/exercise-image-search?q=press").json()
    assert [r["name"] for r in results] == ["Barbell Bench Press", "Incline Dumbbell Press"]
    assert results[0]["image_urls"] == [
        image_search.IMAGE_BASE + "Barbell_Bench_Press/0.jpg",
        image_search.IMAGE_BASE + "Barbell_Bench_Press/1.jpg",
    ]
    # sin resultados = lista vacía, no error
    assert client.get("/api/v1/exercise-image-search?q=zzzzz").json() == []


def test_import_from_url_stores_image_and_resets_framing(client: TestClient):
    bench = _bench(client)
    # encuadre previo distinto del neutro, para verificar el reset
    client.patch(
        f"/api/v1/exercises/{bench}",
        json={"image_pos_x": 20, "image_pos_y": 80, "image_zoom": 2},
    )
    url = image_search.IMAGE_BASE + "Barbell_Bench_Press/0.jpg"
    resp = client.post(f"/api/v1/exercises/{bench}/image/from-url", json={"url": url})
    assert resp.status_code == 204, resp.text

    listed = next(e for e in client.get("/api/v1/exercises").json() if e["id"] == bench)
    assert listed["has_image"] is True
    assert listed["image_pos_x"] == 50
    assert listed["image_pos_y"] == 50
    assert listed["image_zoom"] == 1
    got = client.get(f"/api/v1/exercises/{bench}/image")
    assert got.status_code == 200
    assert got.content == PNG


def test_import_from_url_rejects_disallowed_urls(client: TestClient):
    bench = _bench(client)
    bad = [
        "http://raw.githubusercontent.com/x/y.jpg",  # http, no https
        "https://evil.example.com/y.jpg",  # host fuera de la allowlist
        "https://raw.githubusercontent.com/x/y.svg",  # sufijo no permitido
        "https://raw.githubusercontent.com/x/y",  # sin sufijo
    ]
    for url in bad:
        resp = client.post(f"/api/v1/exercises/{bench}/image/from-url", json={"url": url})
        assert resp.status_code == 422, url
        assert resp.json()["detail"] == "image_url_not_allowed"


def test_import_from_url_requires_edit_rights(client: TestClient, app):
    from tests.conftest import login, make_user

    bench = _bench(client)
    make_user(client, "vali")
    vali = login(app, "vali")
    url = image_search.IMAGE_BASE + "Barbell_Bench_Press/0.jpg"
    # bench es del catálogo (owner NULL): un no-admin no puede tocarlo
    assert (
        vali.post(f"/api/v1/exercises/{bench}/image/from-url", json={"url": url}).status_code
        == 404
    )
