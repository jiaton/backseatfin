import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type Key, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

import { type CarReportCreate, useCreateCarReport } from '../api/use-car-reports'

type Answer = boolean | null
type Field = 'moving' | 'canvas_video' | 'canvas_audio' | 'webcodecs_video' | 'video_tag'

const QUESTIONS: [Field, Key][] = [
  ['moving', 'qMoving'],
  ['canvas_video', 'qCanvasVideo'],
  ['canvas_audio', 'qCanvasAudio'],
  ['webcodecs_video', 'qWebcodecsVideo'],
  ['video_tag', 'qVideoTag'],
]

function YesNo({ label, value, onChange }: { label: string; value: Answer; onChange: (v: Answer) => void }) {
  const { t } = useT()
  return (
    <div className="flex items-center justify-between gap-3" role="group" aria-label={label}>
      <span className="text-lg">{label}</span>
      <div className="flex gap-2">
        {([true, false] as const).map((v) => (
          <Button
            key={String(v)}
            type="button"
            size="lg"
            variant={value === v ? 'default' : 'outline'}
            aria-pressed={value === v}
            className={cn('w-20')}
            onClick={() => onChange(value === v ? null : v)}
          >
            {t(v ? 'yes' : 'no')}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function ReportForm({ metrics }: { metrics: string }) {
  const { t } = useT()
  const [answers, setAnswers] = useState<Record<Field, Answer>>({
    moving: null,
    canvas_video: null,
    canvas_audio: null,
    webcodecs_video: null,
    video_tag: null,
  })
  const [notes, setNotes] = useState('')
  const create = useCreateCarReport()

  function submit(e: FormEvent) {
    e.preventDefault()
    const body: CarReportCreate = { ...answers, notes, metrics }
    create.mutate(body, {
      onSuccess: () => toast.success(t('reportSaved')),
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={t('reportFormLabel')}>
      <h2 className="text-xl font-semibold">{t('reportHeading')}</h2>
      {QUESTIONS.map(([field, key]) => (
        <YesNo
          key={field}
          label={t(key)}
          value={answers[field]}
          onChange={(v) => setAnswers((a) => ({ ...a, [field]: v }))}
        />
      ))}
      <Input aria-label={t('notes')} placeholder={t('notesPlaceholder')} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button type="submit" size="lg" disabled={create.isPending}>
        {t('submitReport')}
      </Button>
    </form>
  )
}
