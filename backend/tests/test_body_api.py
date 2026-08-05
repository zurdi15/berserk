from fastapi.testclient import TestClient


def test_body_upsert_list_delete(client: TestClient):
    resp = client.put("/api/v1/body/2026-08-01", json={"weight_kg": 80.5})
    assert resp.status_code == 200 and resp.json()["weight_kg"] == 80.5

    # upsert del mismo día actualiza sin duplicar
    resp = client.put("/api/v1/body/2026-08-01", json={"weight_kg": 80.0, "waist_cm": 84})
    assert resp.status_code == 200

    client.put("/api/v1/body/2026-08-03", json={"weight_kg": 79.6})
    entries = client.get("/api/v1/body").json()
    assert [e["date"] for e in entries] == ["2026-08-01", "2026-08-03"]
    assert entries[0]["waist_cm"] == 84

    assert client.put("/api/v1/body/2026-08-04", json={}).status_code == 422

    assert client.delete("/api/v1/body/2026-08-01").status_code == 204
    assert client.delete("/api/v1/body/2026-08-01").status_code == 404
    assert [e["date"] for e in client.get("/api/v1/body").json()] == ["2026-08-03"]
