from datetime import datetime, timedelta, timezone

import pytest

from app.auth.service import (
    MAX_PENDING_PAIRINGS,
    AuthService,
    InvalidCredentialsError,
    PairingRegistry,
    TooManyPairingsError,
    UnknownCodeError,
)


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 9, 27, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.now


def _service(clock: Clock) -> AuthService:
    return AuthService("the-key", PairingRegistry(clock=clock))


def test_pairing_delivers_token_exactly_once(session_factory):
    svc = _service(Clock())
    pid, code, _ = svc.start_pairing()
    assert len(code) == 6 and code.isdigit()
    assert svc.poll_pairing(pid) == ("pending", None)
    with session_factory() as s:
        device = svc.approve_pairing(s, code, "Tesla")
        state, token = svc.poll_pairing(pid)
        assert state == "approved" and token
        assert svc.authenticate_device(s, token).id == device.id
    assert svc.poll_pairing(pid) == ("expired", None)


def test_pairing_expires_and_code_cannot_be_approved_late(session_factory):
    clock = Clock()
    svc = _service(clock)
    pid, code, _ = svc.start_pairing()
    clock.now += timedelta(minutes=6)
    with session_factory() as s, pytest.raises(UnknownCodeError):
        svc.approve_pairing(s, code, "Tesla")
    assert svc.poll_pairing(pid) == ("expired", None)


def test_pending_pairings_are_capped_until_they_expire():
    clock = Clock()
    svc = _service(clock)
    for _ in range(MAX_PENDING_PAIRINGS):
        svc.start_pairing()
    with pytest.raises(TooManyPairingsError):
        svc.start_pairing()
    clock.now += timedelta(minutes=6)
    svc.start_pairing()


def test_wrong_code_is_rejected(session_factory):
    svc = _service(Clock())
    _, code, _ = svc.start_pairing()
    wrong = "000000" if code != "000000" else "111111"
    with session_factory() as s, pytest.raises(UnknownCodeError):
        svc.approve_pairing(s, wrong, "x")


def test_key_login_and_revocation(session_factory):
    svc = _service(Clock())
    with session_factory() as s:
        with pytest.raises(InvalidCredentialsError):
            svc.login_with_key(s, "nope", "phone", "ua")
        device, token = svc.login_with_key(s, "the-key", "phone", "ua")
        assert svc.authenticate_device(s, token).name == "phone"
        svc.revoke(s, device.id)
        assert svc.authenticate_device(s, token) is None
        assert svc.authenticate_device(s, "garbage") is None
