import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { QueryState } from '@/components/ui/query-state'
import { useT } from '@/lib/i18n'

import { useCarReports } from '../api/use-car-reports'

const mark = (v: boolean | null | undefined) => (v == null ? '—' : v ? '✓' : '✗')

export function ReportsCard() {
  const { t } = useT()
  const reports = useCarReports()
  // The path stays a <code> element, so split the sentence around it.
  const [noReportsBefore, noReportsAfter] = t('noReports').split('{path}')
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('reportsTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryState query={reports}>
          {(list) =>
            list.length ? (
              <ul className="flex flex-col gap-3 text-sm">
                {list.map((r) => (
                  <li key={r.id}>
                    <p>
                      {t('reportLine', {
                        time: new Date(r.created_at).toLocaleString(),
                        moving: mark(r.moving),
                        canvasVideo: mark(r.canvas_video),
                        canvasAudio: mark(r.canvas_audio),
                        webcodecs: mark(r.webcodecs_video),
                        videoTag: mark(r.video_tag),
                      })}
                      {r.notes && ` · ${r.notes}`}
                    </p>
                    {r.metrics && <p className="font-mono text-xs break-all">{r.metrics}</p>}
                    <p className="font-mono text-xs break-all text-muted-foreground">{r.user_agent}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {noReportsBefore}
                <code>/test</code>
                {noReportsAfter}
              </p>
            )
          }
        </QueryState>
      </CardContent>
    </Card>
  )
}
