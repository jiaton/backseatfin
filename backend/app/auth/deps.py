"""Auth dependencies used by every protected route.

Admin routes (require_auth) accept the X-API-Key header (scripts, curl) or the device
session cookie (browsers; logging in with a setup code or the key mints a device
cookie). With AUTH=off everyone is let in (via="open").
Player routes (require_player / require_ws_player) additionally accept the Emby player
session cookie minted on the car host — that one grants playback only, never admin."""

from fastapi import Depends, HTTPException, Request, WebSocket, WebSocketException, status
from sqlmodel import Session

from app.auth.service import AuthService, Principal
from app.container import auth_service
from app.core.db import get_session
from app.stream.ports import Viewer

COOKIE_NAME = "bsf_device"
COOKIE_MAX_AGE = 400 * 24 * 3600  # Chrome's cap for cookie lifetime
PLAYER_COOKIE_NAME = "bsf_player"
PLAYER_COOKIE_MAX_AGE = 12 * 3600

# Sentinel: a credential was presented and it was wrong (→ 401, which fail2ban counts).
_INVALID = Principal(via="invalid")


def resolve_principal(
    headers_key: str | None, cookie: str | None, session: Session, service: AuthService = auth_service
) -> Principal | None:
    """None = no credential presented. Raises nothing; callers decide 401 vs 200."""
    if not service.required:
        return Principal(via="open")
    if headers_key:
        return Principal(via="api_key") if service.check_api_key(headers_key) else _INVALID
    if cookie:
        device = service.authenticate_device(session, cookie)
        return Principal(via="device", device_id=device.id, device_name=device.name) if device else _INVALID
    return None


def resolve_player_principal(
    headers_key: str | None, cookie: str | None, player_cookie: str | None, session: Session,
    service: AuthService = auth_service,
) -> Principal | None:
    p = resolve_principal(headers_key, cookie, session, service)
    if p is not None:
        return p
    if player_cookie:
        return service.authenticate_player(player_cookie) or _INVALID
    return None


def is_valid(p: Principal | None) -> bool:
    return p is not None and p is not _INVALID


def viewer_for(p: Principal) -> Viewer:
    return Viewer(emby_token=p.emby_token, emby_user_id=p.emby_user_id)


def require_auth(request: Request, session: Session = Depends(get_session)) -> Principal:
    p = resolve_principal(request.headers.get("x-api-key"), request.cookies.get(COOKIE_NAME), session)
    if not is_valid(p):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")
    assert p is not None
    return p


def require_player(request: Request, session: Session = Depends(get_session)) -> Principal:
    p = resolve_player_principal(
        request.headers.get("x-api-key"), request.cookies.get(COOKIE_NAME),
        request.cookies.get(PLAYER_COOKIE_NAME), session,
    )
    if not is_valid(p):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")
    assert p is not None
    return p


def require_ws_player(websocket: WebSocket, session: Session = Depends(get_session)) -> Principal:
    # Same-origin WebSocket handshakes carry cookies, so the car needs nothing extra.
    p = resolve_player_principal(
        websocket.headers.get("x-api-key"), websocket.cookies.get(COOKIE_NAME),
        websocket.cookies.get(PLAYER_COOKIE_NAME), session,
    )
    if not is_valid(p):
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="not authenticated")
    assert p is not None
    return p
