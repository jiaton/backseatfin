from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Optional key for scripts (X-API-Key header); a browser may also sign in with it
    # once. Browsers normally sign in with a one-time setup code (first start's log, or
    # `backseatfin-code`) or by pairing.
    api_key: str = ""

    # "off" = no sign-in at all: only behind something that authenticates already
    # (Cloudflare Access, Tailscale, a password gate). Default "on".
    auth: Literal["on", "off"] = "on"

    database_path: str = "/app/data/backseatfin.db"

    # How often followed YouTube channels are re-read for the home feed.
    feed_refresh_interval_seconds: int = 1800

    # Each car stream is one live ffmpeg encode.
    max_concurrent_streams: int = 2

    # HDR / Dolby Vision tone mapping (see stream.adapter.ToneMapping). Either missing
    # (e.g. a dev machine) degrades gracefully: no GPU → CPU tone mapping at ≤720p; no
    # jellyfin-ffmpeg → HDR plays with its colours untouched.
    hdr_ffmpeg_path: str = "/usr/lib/jellyfin-ffmpeg/ffmpeg"
    gpu_render_device: str = "/dev/dri/renderD128"

    # Emby, reached directly (not through the reverse proxy). Optional: without Emby,
    # only YouTube is offered. The API key is what the server uses for Emby when a
    # viewer signed in to BackseatFin (not Emby) plays something from it; optional.
    emby_url: str = "http://emby:8096"
    emby_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
