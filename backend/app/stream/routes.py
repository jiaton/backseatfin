import asyncio
import logging
from contextlib import aclosing, suppress

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, WebSocketException, status
from fastapi.responses import StreamingResponse

from app.auth.deps import require_player, require_ws_player, viewer_for
from app.auth.service import Principal
from app.container import stream_service
from app.stream.ports import OutputFormat, Quality, SourceUnavailableError, StreamRequest, UnknownSourceError
from app.stream.service import TooManyStreamsError

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stream", tags=["stream"])


def _request(
    source: str, t: float, audio: int | None, sub: int | None, quality: Quality,
    maxw: int | None = None, maxh: int | None = None, paced: bool = True,
) -> StreamRequest:
    return StreamRequest(
        source=source, start_seconds=t, audio_index=audio, subtitle_index=sub, quality=quality,
        max_width=maxw, max_height=maxh, paced=paced,
    )


class FlowControl:
    """The client's "hold" / "go" text messages on the stream WebSocket. While held, we
    stop reading the stream (and so ffmpeg stops at a full pipe) instead of sending more
    than the client wants to buffer. A client that leaves releases the hold, so the send
    loop wakes up and notices."""

    def __init__(self, websocket: WebSocket):
        self._ws = websocket
        self._go = asyncio.Event()
        self._go.set()
        self._task = asyncio.create_task(self._listen())

    async def _listen(self) -> None:
        try:
            while True:
                message = await self._ws.receive_text()
                if message == "hold":
                    self._go.clear()
                elif message == "go":
                    self._go.set()
        except (WebSocketDisconnect, RuntimeError, KeyError):
            pass
        finally:
            self._go.set()

    async def wait(self) -> None:
        await self._go.wait()

    def close(self) -> None:
        self._task.cancel()


@router.websocket("/ws")
async def stream_ws(
    websocket: WebSocket,
    source: str = Query(..., max_length=100),
    t: float = Query(0.0, ge=0),
    audio: int | None = Query(None, ge=0),
    sub: int | None = Query(None, ge=0),
    quality: Quality = Query(Quality.HIGH),
    format: OutputFormat = Query(OutputFormat.JSMPEG_TS),  # noqa: A002 - query param name
    # The player's display box in device pixels: the stream is never bigger.
    maxw: int | None = Query(None, ge=160, le=4096),
    maxh: int | None = Query(None, ge=120, le=4096),
    flow: bool = Query(False),
    principal: Principal = Depends(require_ws_player),
):
    """Encoded bytes as binary WebSocket frames: MPEG-TS for JSMpeg (default), or raw
    H.264 for the WebCodecs probe (format=h264). Seeking or switching tracks = the
    client reconnects with new parameters."""
    if format is OutputFormat.FRAGMENTED_MP4:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="fmp4 is served over HTTP")
    await websocket.accept()
    # aclosing: the moment the client goes away, close the generator so its finally
    # block kills ffmpeg now, not whenever the GC gets to it.
    # flow=1: the client buffers and says "hold"/"go" (H.264 only; JSMpeg needs pacing).
    flow_control = flow and format is OutputFormat.H264_TS
    request = _request(source, t, audio, sub, quality, maxw, maxh, paced=not flow_control)
    control = FlowControl(websocket) if flow_control else None
    async with aclosing(stream_service.open(request, viewer_for(principal), format)) as chunks:
        try:
            async for chunk in chunks:
                await websocket.send_bytes(chunk)
                if control:
                    await control.wait()
        except TooManyStreamsError as e:
            await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER, reason=str(e))
            return
        except (UnknownSourceError, SourceUnavailableError) as e:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason=str(e)[:120])
            return
        except (WebSocketDisconnect, RuntimeError):
            return  # client left mid-stream
        except Exception:
            # Never leave the player waiting on a dead socket: say so and close.
            log.exception("stream %s failed", source)
            with suppress(RuntimeError):
                await websocket.close(code=status.WS_1011_INTERNAL_ERROR, reason="server error")
            return
        finally:
            if control:
                control.close()
    with suppress(RuntimeError):
        await websocket.close()


@router.get("/video.mp4")
async def stream_mp4(
    source: str = Query(..., max_length=100),
    t: float = Query(0.0, ge=0),
    principal: Principal = Depends(require_player),
):
    """Same content as an ordinary progressive MP4 — the <video>-tag control case."""
    chunks = stream_service.open(
        _request(source, t, None, None, Quality.HIGH), viewer_for(principal), OutputFormat.FRAGMENTED_MP4
    )
    try:
        first = await anext(chunks)
    except TooManyStreamsError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e
    except (UnknownSourceError, SourceUnavailableError) as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e

    async def body():
        async with aclosing(chunks):
            yield first
            async for chunk in chunks:
                yield chunk

    return StreamingResponse(body(), media_type="video/mp4")
