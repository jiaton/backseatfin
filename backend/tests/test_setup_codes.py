from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth import setup_codes
from app.auth.models import SetupCode, utcnow
from app.auth.service import AuthService, InvalidCredentialsError
from app.container import auth_service
from app.core.db import get_session
from app.main import app


def test_code_signs_in_once(session_factory):
    svc = AuthService("")
    with session_factory() as s:
        code = setup_codes.issue(s, setup_codes.COMMAND_TTL)
        device, _ = svc.login_with_key(s, code, "phone", "ua")
        assert device.name == "phone"
        with pytest.raises(InvalidCredentialsError):
            svc.login_with_key(s, code, "phone 2", "ua")


def test_no_api_key_configured_accepts_no_key(session_factory):
    svc = AuthService("")
    assert not svc.check_api_key("")
    with session_factory() as s, pytest.raises(InvalidCredentialsError):
        svc.login_with_key(s, "anything", "phone", "ua")


def test_wrong_tries_burn_the_code(session_factory):
    with session_factory() as s:
        code = setup_codes.issue(s, setup_codes.COMMAND_TTL)
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(setup_codes.MAX_ATTEMPTS):
            assert not setup_codes.redeem(s, wrong)
        assert not setup_codes.redeem(s, code)


def test_expired_code_is_refused(session_factory):
    with session_factory() as s:
        code = setup_codes.issue(s, setup_codes.COMMAND_TTL)
        row = s.get(SetupCode, 1)
        row.expires_at = utcnow() - timedelta(seconds=1)
        s.add(row)
        s.commit()
        assert not setup_codes.redeem(s, code)


def test_a_new_code_replaces_the_old(session_factory):
    with session_factory() as s:
        old = setup_codes.issue(s, setup_codes.COMMAND_TTL)
        new = setup_codes.issue(s, setup_codes.COMMAND_TTL)
        if old != new:
            assert not setup_codes.redeem(s, old)
        assert setup_codes.redeem(s, new)


def test_api_key_never_counts_as_a_wrong_try(session_factory):
    svc = AuthService("the-key")
    with session_factory() as s:
        code = setup_codes.issue(s, setup_codes.COMMAND_TTL)
        for _ in range(setup_codes.MAX_ATTEMPTS + 1):
            svc.login_with_key(s, "the-key", "script", "")
        assert setup_codes.redeem(s, code)


@pytest.fixture
def client(session_factory):
    def override():
        with session_factory() as s:
            yield s

    app.dependency_overrides[get_session] = override
    yield TestClient(app)
    app.dependency_overrides.clear()
    auth_service.required = True


def test_login_api_takes_a_setup_code(client, session_factory):
    with session_factory() as s:
        code = setup_codes.issue(s, setup_codes.COMMAND_TTL)
    assert client.post("/api/auth/login", json={"key": "123"}).status_code == 401
    r = client.post("/api/auth/login", json={"key": f" {code} ", "name": "phone"})
    assert r.status_code == 200
    assert client.get("/api/tube/history").status_code == 200


def test_auth_off_lets_everyone_in(client):
    auth_service.required = False
    assert client.get("/api/auth/session").json()["via"] == "open"
    assert client.get("/api/tube/history").status_code == 200
