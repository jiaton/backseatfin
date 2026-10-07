import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

const WATCHED = ['playing', 'pause', 'waiting', 'stalled', 'ended', 'error', 'emptied'] as const

/** Control case: the same test pattern through an ordinary <video> element — expected to
 * be blocked while the car is moving. Logs the element's events so a silent block shows up. */
export function VideoTagProbe() {
  const { t } = useT()
  const ref = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [events, setEvents] = useState<string[]>([])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handlers = WATCHED.map((name) => {
      const handler = () => {
        const line = `${new Date().toLocaleTimeString()} ${name} @${el.currentTime.toFixed(1)}s`
        setEvents((prev) => [line, ...prev].slice(0, 8))
      }
      el.addEventListener(name, handler)
      return [name, handler] as const
    })
    return () => handlers.forEach(([name, handler]) => el.removeEventListener(name, handler))
  }, [src])

  function start() {
    setEvents([])
    setSrc('/api/stream/video.mp4?source=test')
  }

  function stop() {
    ref.current?.pause()
    setSrc(null)
  }

  return (
    <section className="flex flex-col gap-3" aria-label={t('videoProbe')}>
      <h2 className="text-xl font-semibold">{t('videoHeading')}</h2>
      {src ? (
        <video
          ref={ref}
          src={src}
          autoPlay
          controls
          playsInline
          className="aspect-video w-full rounded-lg bg-muted"
        />
      ) : (
        <div className="aspect-video w-full rounded-lg bg-muted" />
      )}
      <div className="flex items-center gap-3">
        <Button size="lg" variant="secondary" onClick={src ? stop : start}>
          {t(src ? 'stop' : 'play')}
        </Button>
      </div>
      <ul className="font-mono text-sm text-muted-foreground" aria-label={t('videoEvents')}>
        {events.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </section>
  )
}
