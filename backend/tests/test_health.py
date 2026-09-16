"""The disclaimer is a product requirement, so it is tested like one."""

from fastapi.testclient import TestClient

from zealo.main import DISCLAIMER, app

client = TestClient(app)


def test_health_reports_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_health_carries_the_required_disclaimer():
    body = client.get("/health").json()
    assert body["disclaimer"] == DISCLAIMER
    assert "Stock levels are estimates" in body["disclaimer"]
