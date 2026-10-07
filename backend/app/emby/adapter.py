"""Emby HTTP API clients — the only module that talks to Emby."""

import logging
from pathlib import Path

import httpx

from app.emby.ports import EmbyItem, EmbyNotFoundError, EmbyStream, PlaybackEvent, PlaybackReport

log = logging.getLogger(__name__)

TICKS_PER_SECOND = 10_000_000


class EmbyLibraryNotifier:
    """Implements youtube.ports.MediaLibraryPort."""

    def __init__(self, base_url: str, api_key: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key

    async def notify_new_files(self, paths: list[Path]) -> None:
        if not self._api_key:
            return  # Emby's own folder monitoring will pick them up.
        body = {"Updates": [{"Path": str(p), "UpdateType": "Created"} for p in paths]}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self._base_url}/emby/Library/Media/Updated",
                    json=body,
                    headers={"X-Emby-Token": self._api_key},
                )
                resp.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("Emby library notify failed (files are in place; Emby will find them later): %s", e)


def _to_stream(s: dict) -> EmbyStream:
    return EmbyStream(
        index=int(s["Index"]),
        type=s.get("Type", ""),
        codec=(s.get("Codec") or "").lower(),
        title=s.get("DisplayTitle") or s.get("Title") or s.get("Language") or f"#{s['Index']}",
        language=s.get("Language"),
        is_default=bool(s.get("IsDefault")),
        is_external=bool(s.get("IsExternal")),
        is_text=bool(s.get("IsTextSubtitleStream")),
        frame_rate=s.get("RealFrameRate") or s.get("AverageFrameRate"),
        # "SDR", "HDR 10", "DolbyVision", "HLG", ...
        hdr=s.get("Type") == "Video" and (s.get("VideoRange") or "SDR") != "SDR",
    )


class EmbyHttpApi:
    """Implements emby.ports.EmbyApiPort."""

    def __init__(self, base_url: str) -> None:
        self._base = base_url.rstrip("/") + "/emby"

    def _client(self, token: str | None = None) -> httpx.AsyncClient:
        headers = {"X-Emby-Token": token} if token else {}
        return httpx.AsyncClient(base_url=self._base, headers=headers, timeout=15)

    async def verify_user_token(self, token: str, user_id: str) -> bool:
        async with self._client(token) as c:
            resp = await c.get(f"/Users/{user_id}")
        return resp.status_code == 200

    async def get_item(self, item_id: str, token: str, user_id: str | None) -> EmbyItem:
        try:
            return await self._get_item(item_id, token, user_id)
        except httpx.HTTPError as e:
            raise EmbyNotFoundError(f"Emby didn't answer for item {item_id}: {e.__class__.__name__}") from e

    async def _get_item(self, item_id: str, token: str, user_id: str | None) -> EmbyItem:
        async with self._client(token) as c:
            if user_id:
                resp = await c.get(f"/Users/{user_id}/Items/{item_id}", params={"Fields": "MediaSources"})
                raw = resp.json() if resp.status_code == 200 else None
            else:
                resp = await c.get("/Items", params={"Ids": item_id, "Fields": "MediaSources,MediaStreams"})
                items = resp.json().get("Items", []) if resp.status_code == 200 else []
                raw = items[0] if items else None
        if raw is None:
            raise EmbyNotFoundError(f"Emby item {item_id} not found or not accessible")
        sources = raw.get("MediaSources") or []
        if not sources:
            raise EmbyNotFoundError(f"Emby item {item_id} has no playable media source")
        source = sources[0]
        runtime = raw.get("RunTimeTicks") or source.get("RunTimeTicks")
        resume = (raw.get("UserData") or {}).get("PlaybackPositionTicks") or 0
        return EmbyItem(
            id=str(raw["Id"]),
            name=raw.get("Name") or str(raw["Id"]),
            series_name=raw.get("SeriesName"),
            season_number=raw.get("ParentIndexNumber"),
            episode_number=raw.get("IndexNumber"),
            runtime_seconds=runtime / TICKS_PER_SECOND if runtime else None,
            resume_seconds=resume / TICKS_PER_SECOND,
            media_source_id=str(source["Id"]),
            streams=[_to_stream(s) for s in source.get("MediaStreams") or []],
        )

    def stream_input(self, item_id: str, media_source_id: str, token: str) -> tuple[str, dict[str, str]]:
        url = f"{self._base}/Videos/{item_id}/stream?static=true&MediaSourceId={media_source_id}"
        return url, {"X-Emby-Token": token}

    async def download_subtitle(
        self, item_id: str, media_source_id: str, index: int, token: str, dest: Path, timeout: float = 60
    ) -> None:
        async with httpx.AsyncClient(base_url=self._base, headers={"X-Emby-Token": token}, timeout=timeout) as c:
            resp = await c.get(f"/Videos/{item_id}/{media_source_id}/Subtitles/{index}/Stream.ass")
        if resp.status_code != 200:
            raise EmbyNotFoundError(f"subtitle {index} of item {item_id} unavailable ({resp.status_code})")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(resp.content)

    async def report_playback(self, event: PlaybackEvent, report: PlaybackReport, token: str) -> None:
        path = {"start": "/Sessions/Playing", "progress": "/Sessions/Playing/Progress",
                "stopped": "/Sessions/Playing/Stopped"}[event]
        body = {
            "ItemId": report.item_id,
            "MediaSourceId": report.media_source_id,
            "PlaySessionId": report.play_session_id,
            "PositionTicks": int(report.position_seconds * TICKS_PER_SECOND),
            "IsPaused": report.is_paused,
            "CanSeek": True,
            "PlayMethod": "Transcode",
        }
        try:
            async with self._client(token) as c:
                resp = await c.post(path, json=body)
                resp.raise_for_status()
        except httpx.HTTPError as e:
            # Progress reporting is best-effort: a missed report only costs resume accuracy.
            log.warning("Emby playback report (%s) failed: %s", event, e)

    async def fetch_web_index(self) -> str:
        async with httpx.AsyncClient(timeout=10) as c:
            resp = await c.get(self._base.removesuffix("/emby") + "/web/index.html")
            resp.raise_for_status()
            return resp.text
