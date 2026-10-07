from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlmodel import Session

from app.auth.deps import (
    COOKIE_MAX_AGE,
    COOKIE_NAME,
    PLAYER_COOKIE_MAX_AGE,
    PLAYER_COOKIE_NAME,
    is_valid,
    require_auth,
    resolve_principal,
)
from app.auth.schemas import (
    DeviceOut,
    KeyLogin,
    PairingApprove,
    PairingStarted,
    PairingStatus,
    PlayerSessionCreate,
    SessionOut,
)
from app.auth.service import InvalidCredentialsError, NotFoundError, Principal, TooManyPairingsError, UnknownCodeError
from app.container import auth_service
from app.core.db import get_session

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_cookie(
    request: Request, response: Response, token: str, name: str = COOKIE_NAME, max_age: int = COOKIE_MAX_AGE
) -> None:
    # Behind a reverse proxy → nginx the app sees plain http; trust the forwarded proto so the
    # cookie is Secure in production but still usable on the LAN over http.
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(name, token, max_age=max_age, httponly=True, secure=secure, samesite="lax", path="/")


@router.get("/session", response_model=SessionOut)
def get_session_info(request: Request, session: Session = Depends(get_session)):
    """Always 200 — "not signed in" is a normal state for a fresh car browser, and must
    not look like a failed login to fail2ban. A stale/revoked cookie is reported as
    unauthenticated and cleared."""
    p = resolve_principal(request.headers.get("x-api-key"), request.cookies.get(COOKIE_NAME), session)
    if not is_valid(p):
        return SessionOut(authenticated=False)
    assert p is not None
    return SessionOut(authenticated=True, via=p.via, device_id=p.device_id, device_name=p.device_name)


@router.post("/login", response_model=SessionOut)
def login(body: KeyLogin, request: Request, response: Response, session: Session = Depends(get_session)):
    try:
        device, token = auth_service.login_with_key(session, body.key, body.name, request.headers.get("user-agent", ""))
    except InvalidCredentialsError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    _set_cookie(request, response, token)
    return SessionOut(authenticated=True, via="device", device_id=device.id, device_name=device.name)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, principal: Principal = Depends(require_auth), session: Session = Depends(get_session)):
    if principal.device_id is not None:
        auth_service.revoke(session, principal.device_id)
    response.delete_cookie(COOKIE_NAME, path="/")


@router.post("/player-session", status_code=status.HTTP_204_NO_CONTENT)
async def create_player_session(body: PlayerSessionCreate, request: Request, response: Response):
    """Car player: trade the viewer's Emby token for a playback-only cookie."""
    try:
        sid = await auth_service.start_player_session(body.emby_token, body.emby_user_id)
    except InvalidCredentialsError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    _set_cookie(request, response, sid, PLAYER_COOKIE_NAME, PLAYER_COOKIE_MAX_AGE)


@router.post("/pairings", response_model=PairingStarted, status_code=status.HTTP_201_CREATED)
def start_pairing():
    try:
        pid, code, expires_at = auth_service.start_pairing()
    except TooManyPairingsError as e:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(e)) from e
    return PairingStarted(pairing_id=pid, code=code, expires_at=expires_at)


@router.get("/pairings/{pairing_id}", response_model=PairingStatus)
def poll_pairing(pairing_id: str, request: Request, response: Response, session: Session = Depends(get_session)):
    state, token = auth_service.poll_pairing(pairing_id)
    if token is not None:
        auth_service.record_user_agent(session, token, request.headers.get("user-agent", ""))
        _set_cookie(request, response, token)
    return PairingStatus(status=state)  # type: ignore[arg-type]


@router.post("/pairings/approve", response_model=DeviceOut, dependencies=[Depends(require_auth)])
def approve_pairing(body: PairingApprove, session: Session = Depends(get_session)):
    try:
        return auth_service.approve_pairing(session, body.code, body.name)
    except UnknownCodeError as e:
        # 404, not 401: a typo by an already-authenticated user isn't an attack.
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e


@router.get("/devices", response_model=list[DeviceOut], dependencies=[Depends(require_auth)])
def list_devices(session: Session = Depends(get_session)):
    return auth_service.list_devices(session)


@router.delete("/devices/{device_id}", response_model=DeviceOut, dependencies=[Depends(require_auth)])
def revoke_device(device_id: int, session: Session = Depends(get_session)):
    try:
        return auth_service.revoke(session, device_id)
    except NotFoundError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
