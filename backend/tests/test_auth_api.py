import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.container import auth_service
from app.core.db import get_session
from app.main import app

KEY = "test-key"  # conftest sets API_KEY


@pytest.fixture
def client(session_factory):
    def override():
        with session_factory() as s:
            yield s

    app.dependency_overrides[get_session] = override
    auth_service.pairings._by_id.clear()
    # No `with` block: skip lifespan so the download worker / sync loop don't start.
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_session_is_200_when_signed_out_and_protected_routes_401(client):
    assert client.get("/api/auth/session").json() == {
        "authenticated": False, "via": None, "device_id": None, "device_name": None,
    }
    assert client.get("/api/youtube/sources").status_code == 401
    assert client.get("/api/youtube/sources", headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.get("/api/youtube/sources", headers={"X-API-Key": KEY}).status_code == 200


def test_key_login_sets_cookie_that_authenticates(client):
    assert client.post("/api/auth/login", json={"key": "wrong"}).status_code == 401
    r = client.post("/api/auth/login", json={"key": KEY, "name": "phone"})
    assert r.status_code == 200 and "bsf_device" in r.cookies
    set_cookie = r.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "samesite=lax" in set_cookie and "secure" not in set_cookie
    assert client.get("/api/youtube/sources").status_code == 200
    assert client.get("/api/auth/session").json()["device_name"] == "phone"


def test_cookie_is_secure_behind_https_proxy(client):
    r = client.post("/api/auth/login", json={"key": KEY}, headers={"X-Forwarded-Proto": "https"})
    assert "secure" in r.headers["set-cookie"].lower()


def test_pairing_flow_and_revocation(client):
    car = TestClient(app)
    started = car.post("/api/auth/pairings").json()
    assert car.get(f"/api/auth/pairings/{started['pairing_id']}").json() == {"status": "pending"}

    # Approving needs auth; a wrong code is 404 (typo), not 401 (would feed fail2ban).
    assert client.post("/api/auth/pairings/approve", json={"code": started["code"]}).status_code == 401
    phone = {"X-API-Key": KEY}
    wrong = "000000" if started["code"] != "000000" else "111111"
    assert client.post("/api/auth/pairings/approve", json={"code": wrong}, headers=phone).status_code == 404
    device = client.post("/api/auth/pairings/approve", json={"code": started["code"], "name": "Tesla"}, headers=phone)
    assert device.status_code == 200

    r = car.get(f"/api/auth/pairings/{started['pairing_id']}", headers={"User-Agent": "Tesla/2026.32"})
    assert r.json() == {"status": "approved"} and "bsf_device" in r.cookies
    assert car.get("/api/auth/session").json()["device_name"] == "Tesla"
    assert car.get("/api/youtube/videos").status_code == 200
    listed = client.get("/api/auth/devices", headers=phone).json()
    assert listed[0]["user_agent"] == "Tesla/2026.32"

    client.delete(f"/api/auth/devices/{device.json()['id']}", headers=phone)
    assert car.get("/api/youtube/videos").status_code == 401
    assert car.get("/api/auth/session").json()["authenticated"] is False


def test_websocket_requires_cookie_or_key(client):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/api/stream/ws?source=test"):
            pass
    assert exc.value.code == 1008
    client.post("/api/auth/login", json={"key": KEY})
    # Authenticated: the handshake is accepted; an unknown source then closes with 1008.
    with client.websocket_connect("/api/stream/ws?source=nope") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_bytes()
        assert exc.value.reason == "unknown source 'nope'"
