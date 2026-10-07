import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { useT } from '@/lib/i18n'
import { type JsmpegPlayer, loadJsmpeg } from '@/player/engines/jsmpeg-loader'
import { wsUrl } from '@/player/net'

import { RateCounter } from '../lib/probe-stats'

interface Stats {
  videoFps: number
  audioRate: number
  frames: number
  decodeMs: number
  connected: boolean
}

const IDLE: Stats = { videoFps: 0, audioRate: 0, frames: 0, decodeMs: 0, connected: false }

// Per-frame budget at 30 fps; decode time close to this means the car is at its limit.
const FRAME_BUDGET_MS = 33

/** Plays the backend's synthetic test stream through JSMpeg onto a canvas and shows
 * decode rates and the car's per-frame decode cost, so "can the car keep up" is a
 * number, not a guess. */
export function CanvasProbe({ onMetrics }: { onMetrics: (summary: string) => void }) {
  const { t } = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playerRef = useRef<JsmpegPlayer | null>(null)
  const [quality, setQuality] = useState<'low' | 'high' | 'max'>('high')
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<Stats>(IDLE)
  const [wasm, setWasm] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => playerRef.current?.destroy(), [])

  useEffect(() => {
    if (!stats.frames) return
    const res = { low: '480p', high: '720p', max: '1080p' }[quality]
    onMetrics(`JSMpeg ${res} ${stats.videoFps}fps decode ${stats.decodeMs}ms/frame wasm=${wasm ? 'yes' : 'no'}`)
  }, [onMetrics, quality, stats, wasm])

  async function start() {
    setError(null)
    try {
      const JSMpeg = await loadJsmpeg()
      const video = new RateCounter(performance.now())
      const audio = new RateCounter(performance.now())
      let decodeSum = 0
      let decodeN = 0
      let connected = false
      // Created inside the tap handler so the AudioContext starts unlocked.
      playerRef.current = new JSMpeg.Player(wsUrl(`/api/stream/ws?source=test&quality=${quality}`), {
        canvas: canvasRef.current!,
        audio: true,
        video: true,
        autoplay: true,
        pauseWhenHidden: false,
        reconnectInterval: 0,
        onVideoDecode: (_decoder, elapsedMs) => {
          video.tick()
          decodeSum += elapsedMs ?? 0
          decodeN++
        },
        onAudioDecode: () => audio.tick(),
        onSourceEstablished: () => (connected = true),
        onSourceCompleted: () => (connected = false),
      })
      setWasm(JSMpeg.WASMModule?.IsSupported() ?? false)
      setRunning(true)
      const timer = window.setInterval(() => {
        if (!playerRef.current) return window.clearInterval(timer)
        const now = performance.now()
        setStats({
          videoFps: video.sample(now),
          audioRate: audio.sample(now),
          frames: video.total,
          decodeMs: decodeN ? Math.round((decodeSum / decodeN) * 10) / 10 : 0,
          connected,
        })
        decodeSum = 0
        decodeN = 0
      }, 1000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function stop() {
    playerRef.current?.destroy()
    playerRef.current = null
    setRunning(false)
    setStats(IDLE)
  }

  const load = Math.round((stats.decodeMs / FRAME_BUDGET_MS) * 100)
  return (
    <section className="flex flex-col gap-3" aria-label={t('canvasProbe')}>
      <h2 className="text-xl font-semibold">{t('canvasHeading')}</h2>
      <canvas ref={canvasRef} className="aspect-video w-full rounded-lg bg-muted" />
      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect aria-label={t('jsmpegResolution')} value={quality} disabled={running} onChange={(e) => setQuality(e.target.value as typeof quality)}>
          <option value="low">480p</option>
          <option value="high">720p</option>
          <option value="max">1080p</option>
        </NativeSelect>
        <Button size="lg" onClick={running ? stop : start}>
          {t(running ? 'stop' : 'play')}
        </Button>
        <span className="font-mono text-lg" aria-live="polite">
          {t('canvasStats', {
            state: t(stats.connected ? 'connected' : 'notConnected'),
            fps: stats.videoFps,
            audio: stats.audioRate,
            ms: stats.decodeMs,
            load,
          })}
        </span>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <p className="text-muted-foreground">
        {t('canvasHint')}
        {wasm != null && ` ${t(wasm ? 'decodedWithWasm' : 'decodedWithJs')}`}
      </p>
    </section>
  )
}
