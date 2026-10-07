from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Admin key: X-API-Key header for scripts; browsers exchange it once for a device
    # cookie (POST /api/auth/login) or get a cookie via pairing instead.
    api_key: str

    database_path: str = "/app/data/backseatfin.db"

    # Where finished downloads land. Mounted at the *same* path inside the Emby container,
    # so a path we write is also the path Emby sees — no translation layer needed.
    library_root: str = "/media/youtube"
    # Scratch space for in-progress downloads (same filesystem as library_root is not
    # required — finished files are moved, not renamed).
    download_tmp: str = "/app/data/tmp"

    playlist_sync_interval_seconds: int = 900
    download_max_height: int = 1080

    # Each car stream is one live ffmpeg encode.
    max_concurrent_streams: int = 2

    # HDR / Dolby Vision tone mapping (see stream.adapter.ToneMapping). Either missing
    # (e.g. a dev machine) degrades gracefully: no GPU → CPU tone mapping at ≤720p; no
    # jellyfin-ffmpeg → HDR plays with its colours untouched.
    hdr_ffmpeg_path: str = "/usr/lib/jellyfin-ffmpeg/ffmpeg"
    gpu_render_device: str = "/dev/dri/renderD128"

    # Emby, reached directly (not through the reverse proxy). The API key is optional:
    # without it the library still picks new files up via Emby's own real-time folder
    # monitoring, just less promptly.
    emby_url: str = "http://emby:8096"
    emby_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
