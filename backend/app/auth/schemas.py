from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SessionOut(BaseModel):
    authenticated: bool
    via: Literal["api_key", "device"] | None = None
    device_id: int | None = None
    device_name: str | None = None


class KeyLogin(BaseModel):
    key: str = Field(min_length=1, max_length=200)
    name: str = Field(default="浏览器", min_length=1, max_length=60)


class PairingStarted(BaseModel):
    pairing_id: str
    code: str
    expires_at: datetime


class PairingStatus(BaseModel):
    status: Literal["pending", "approved", "expired"]


class PairingApprove(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")
    name: str = Field(default="Tesla", min_length=1, max_length=60)


class PlayerSessionCreate(BaseModel):
    emby_token: str = Field(min_length=8, max_length=200)
    emby_user_id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9-]+$")


class DeviceOut(BaseModel):
    id: int
    name: str
    user_agent: str
    created_at: datetime
    last_seen_at: datetime
    revoked_at: datetime | None
