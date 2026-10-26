import asyncio
import logging
from contextlib import aclosing, suppress

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status

from app.auth.deps import require_ws_player, viewer_for
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


# At most this much sent and not yet acknowledged (once the client acknowledges): the
# proxies' and kernels' socket buffers would otherwise take megabytes after a "hold", and
# the player's buffer would overshoot by up to a minute of video. 1 MB still fills a
# mobile link of tens of Mbps.
SEND_WINDOW = 1 << 20


class FlowControl:
    """The client's text messages on the stream WebSocket:
    - "hold" / "go": while held, we stop reading the stream (and so ffmpeg stops at a
      full pipe) instead of sending more than the client wants to buffer;
    - "ack <bytes>": how much the client has received in all; from the first one on, at
      most SEND_WINDOW is in flight (older clients don't send it and aren't limited).
    A client that leaves releases both, so the send loop wakes up and notices."""

    def __init__(self, websocket: WebSocket):
        self._ws = websocket
        self._go = asyncio.Event()
        self._go.set()
        self._room = asyncio.Event()  # less than SEND_WINDOW in flight
        self._room.set()
        self._sent = 0
        self._acked: int | None = None
        self._task = asyncio.create_task(self._listen())

    async def _listen(self) -> None:
        try:
            while True:
                message = await self._ws.receive_text()
                if message == "hold":
                    self._go.clear()
                elif message == "go":
                    self._go.set()
                elif message.startswith("ack "):
                    with suppress(ValueError):
                        self._acked = int(message[4:])
                        self._update()
        except (WebSocketDisconnect, RuntimeError, KeyError):
            pass
        finally:
            self._acked = None
            self._go.set()
            self._room.set()

    def _update(self) -> None:
        if self._acked is not None and self._sent - self._acked >= SEND_WINDOW:
            self._room.clear()
        else:
            self._room.set()

    def sent(self, size: int) -> None:
        self._sent += size
        self._update()

    async def wait(self) -> None:
        while not (self._go.is_set() and self._room.is_set()):
            await self._go.wait()
            await self._room.wait()

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
    """Encoded bytes as binary WebSocket frames: MPEG-TS, H.264 + AAC for the WebCodecs
    player (format=h264ts) or MPEG-1 for JSMpeg (default). Seeking or switching tracks =
    the client reconnects with new parameters."""
    await websocket.accept()
    # aclosing: the moment the client goes away, close the generator so its finally
    # block kills ffmpeg now, not whenever the GC gets to it.
    # flow=1: the client buffers, says "hold"/"go" and acknowledges what it got (H.264
    # only; JSMpeg needs pacing).
    flow_control = flow and format is OutputFormat.H264_TS
    request = _request(source, t, audio, sub, quality, maxw, maxh, paced=not flow_control)
    control = FlowControl(websocket) if flow_control else None
    async with aclosing(stream_service.open(request, viewer_for(principal), format)) as chunks:
        try:
            async for chunk in chunks:
                await websocket.send_bytes(chunk)
                if control:
                    control.sent(len(chunk))
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
