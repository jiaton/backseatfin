import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { useT } from '@/lib/i18n'
import { wsUrl } from '@/player/net'

import { AnnexBSplitter, isKeyframe } from '@/player/engines/annexb'
import { RateCounter } from '../lib/probe-stats'

// Main profile, level 4.0: covers 1080p30 (what the server sends is main, no B-frames).
const CODEC = 'avc1.4D4028'

interface Support {
  api: boolean
  hardware: boolean | null
  software: boolean | null
}

interface Stats {
  fps: number
  latencyMs: number
  queue: number
  frames: number
  size: string
}

const IDLE: Stats = { fps: 0, latencyMs: 0, queue: 0, frames: 0, size: '' }

async function detectSupport(): Promise<Support> {
  if (typeof VideoDecoder === 'undefined') return { api: false, hardware: null, software: null }
  const check = async (hardwareAcceleration: HardwareAcceleration) => {
    try {
      return (await VideoDecoder.isConfigSupported({ codec: CODEC, hardwareAcceleration })).supported ?? false
    } catch {
      return false
    }
  }
  // Chrome treats 'prefer-hardware' as "hardware only": supported ⇒ a hardware decoder exists.
  const [hardware, software] = await Promise.all([check('prefer-hardware'), check('prefer-software')])
  return { api: true, hardware, software }
}

const yesNo = (v: boolean | null) => (v == null ? '—' : v ? '✓' : '✗')

/** H.264 decoded by the browser's WebCodecs VideoDecoder (hardware when available) and
 * painted on a canvas — no <video> element involved. The question it answers: does
 * the car allow this while driving? If so it's far lighter than JS-decoded MPEG-1. */
export function WebCodecsProbe({ onMetrics }: { onMetrics: (summary: string) => void }) {
  const { t } = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const [support, setSupport] = useState<Support | null>(null)
  const [quality, setQuality] = useState<'high' | 'max'>('max')
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<Stats>(IDLE)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    detectSupport().then((s) => !cancelled && setSupport(s))
    return () => {
      cancelled = true
      stopRef.current?.()
    }
  }, [])

  useEffect(() => {
    if (!support) return
    const base = `WebCodecs api=${yesNo(support.api)} hw=${yesNo(support.hardware)} sw=${yesNo(support.software)}`
    onMetrics(stats.frames ? `${base}; ${stats.size} ${stats.fps}fps decode-latency ${stats.latencyMs}ms` : base)
  }, [onMetrics, stats, support])

  function start() {
    const canvas = canvasRef.current
    if (!canvas || !support?.api) return
    setError(null)
    const ctx = canvas.getContext('2d')!
    const rate = new RateCounter(performance.now())
    const submitted = new Map<number, number>()
    let latencySum = 0
    let latencyN = 0
    let n = 0
    let gotKey = false

    const decoder = new VideoDecoder({
      output: (frame) => {
        if (canvas.width !== frame.displayWidth) {
          canvas.width = frame.displayWidth
          canvas.height = frame.displayHeight
        }
        ctx.drawImage(frame, 0, 0)
        const t0 = submitted.get(frame.timestamp)
        if (t0 != null) {
          latencySum += performance.now() - t0
          latencyN++
          submitted.delete(frame.timestamp)
        }
        frame.close()
        rate.tick()
      },
      error: (e) => setError(t('decodeError', { message: e.message })),
    })
    decoder.configure({
      codec: CODEC,
      hardwareAcceleration: support.hardware ? 'prefer-hardware' : 'no-preference',
      optimizeForLatency: true,
    })

    const splitter = new AnnexBSplitter()
    const ws = new WebSocket(wsUrl(`/api/stream/ws?source=test&format=h264&quality=${quality}`))
    ws.binaryType = 'arraybuffer'
    ws.onmessage = (e) => {
      for (const au of splitter.push(new Uint8Array(e.data as ArrayBuffer))) {
        const key = isKeyframe(au)
        if (!gotKey && !key) continue // a decoder must start on a keyframe
        gotKey = true
        const timestamp = n++ * 33_333
        submitted.set(timestamp, performance.now())
        decoder.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp, data: au }))
      }
    }
    ws.onerror = () => setError(t('wsFailed'))

    const timer = window.setInterval(() => {
      setStats({
        fps: rate.sample(performance.now()),
        latencyMs: latencyN ? Math.round((latencySum / latencyN) * 10) / 10 : 0,
        queue: decoder.decodeQueueSize,
        frames: rate.total,
        size: canvas.width ? `${canvas.width}x${canvas.height}` : '',
      })
      latencySum = 0
      latencyN = 0
    }, 1000)

    stopRef.current = () => {
      window.clearInterval(timer)
      ws.close()
      if (decoder.state !== 'closed') decoder.close()
      stopRef.current = null
    }
    setRunning(true)
  }

  function stop() {
    stopRef.current?.()
    setRunning(false)
    setStats(IDLE)
  }

  return (
    <section className="flex flex-col gap-3" aria-label={t('webcodecsProbe')}>
      <h2 className="text-xl font-semibold">{t('webcodecsHeading')}</h2>
      <p className="font-mono text-lg" aria-live="polite">
        {support
          ? t('webcodecsSupport', { api: yesNo(support.api), hw: yesNo(support.hardware), sw: yesNo(support.software) })
          : t('detecting')}
      </p>
      <canvas ref={canvasRef} className="aspect-video w-full rounded-lg bg-muted" />
      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect aria-label={t('webcodecsResolution')} value={quality} disabled={running} onChange={(e) => setQuality(e.target.value as 'high' | 'max')}>
          <option value="high">720p</option>
          <option value="max">1080p</option>
        </NativeSelect>
        <Button size="lg" disabled={!support?.api} onClick={running ? stop : start}>
          {t(running ? 'stop' : 'play')}
        </Button>
        <span className="font-mono text-lg" aria-live="polite">
          {t('webcodecsStats', { size: stats.size || '—', fps: stats.fps, ms: stats.latencyMs, queue: stats.queue })}
        </span>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <p className="text-muted-foreground">{t('webcodecsHint')}</p>
    </section>
  )
}
