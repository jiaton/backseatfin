import { useCallback, useState } from 'react'

import { LanguageSwitcher } from '@/components/i18n'
import { CanvasProbe } from '@/features/car-test/components/canvas-probe'
import { ReportForm } from '@/features/car-test/components/report-form'
import { VideoTagProbe } from '@/features/car-test/components/video-tag-probe'
import { WebCodecsProbe } from '@/features/car-test/components/webcodecs-probe'
import { useT } from '@/lib/i18n'

export function CarTestScreen() {
  const { t } = useT()
  const ua = navigator.userAgent
  const isTesla = /tesla/i.test(ua)
  const [jsmpegMetrics, setJsmpegMetrics] = useState('')
  const [webcodecsMetrics, setWebcodecsMetrics] = useState('')
  const onJsmpeg = useCallback((m: string) => setJsmpegMetrics(m), [])
  const onWebcodecs = useCallback((m: string) => setWebcodecsMetrics(m), [])

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold">{t('carTestTitle')}</h1>
          {/* Car-touchscreen sized, like the other controls on this page. */}
          <LanguageSwitcher className="h-11 px-3 text-base" />
        </div>
        <p className="text-lg">{t(isTesla ? 'uaHasTesla' : 'uaNoTesla')}</p>
        <p className="font-mono text-sm break-all text-muted-foreground">{ua}</p>
      </header>
      <CanvasProbe onMetrics={onJsmpeg} />
      <WebCodecsProbe onMetrics={onWebcodecs} />
      <VideoTagProbe />
      <ReportForm metrics={[jsmpegMetrics, webcodecsMetrics].filter(Boolean).join(' | ')} />
    </main>
  )
}
