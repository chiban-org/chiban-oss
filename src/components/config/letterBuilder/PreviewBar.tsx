'use client'

import { Download, Eye, PencilRuler } from 'lucide-react'
import { type RefObject, useEffect, useState, useTransition } from 'react'
import type { LetterPreview } from '@/components/config/letterBuilder/letterView'
import { Pick } from '@/components/config/primitives'
import { Button } from '@/components/ui/button'
import type { TemplateBuilderData } from '@/features/templates/builderData'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import type { SampleRecord } from '@/features/templates/preview/previewTypes'
import type { TemplatePreview } from '@/features/templates/preview/templatePreview'
import type { TemplateKind } from '@/features/templates/templateSchema'

interface Props {
  kind: TemplateKind
  data: TemplateBuilderData
  anchor: RefObject<HTMLElement | null>
  previewing: boolean
  onPreview: (preview: LetterPreview | null) => void
}

function formFrom(anchor: RefObject<HTMLElement | null>, extra: Record<string, string>): FormData {
  const form = anchor.current?.closest('form') ?? undefined
  const data = new FormData(form)
  for (const [name, value] of Object.entries(extra)) data.set(name, value)
  return data
}

function download(base64: string, name: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function PreviewBar({ kind, data, anchor, previewing, onPreview }: Props) {
  const [samples, setSamples] = useState<SampleRecord[] | null>(null)
  const [recordId, setRecordId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const { samplesAction, previewAction } = data
  useEffect(() => {
    let live = true
    void samplesAction(formFrom(anchor, { templateKind: kind })).then((result) => {
      if (!live) return
      setSamples(result.ok ? result.samples : [])
      setRecordId(result.ok ? (result.samples[0]?.id ?? '') : '')
      setMessage(result.ok ? null : result.error)
    })
    return () => {
      live = false
    }
  }, [kind, samplesAction, anchor])
  const run = (id: string, then: (preview: TemplatePreview) => void) =>
    start(async () => {
      const result = await previewAction(formFrom(anchor, { recordId: id }))
      setMessage(result.ok ? null : result.error)
      if (result.ok) then(result.preview)
    })
  const show = (id: string) =>
    run(id, ({ pdfBase64: _pdf, ...preview }) =>
      onPreview({ ...preview, recordLabel: samples?.find((s) => s.id === id)?.label ?? '' }),
    )
  const save = () => run(recordId, (preview) => download(preview.pdfBase64, `${kind}-preview.pdf`))
  const record = documentKind(kind).record
  if (samples !== null && samples.length === 0) {
    return (
      <p className="m-0 text-sm text-muted-foreground">
        {message ?? `There is no ${record.toLowerCase()} on file yet to preview with.`}
      </p>
    )
  }
  return (
    <div className="grid gap-2">
      <Pick
        label={`Preview with (${record.toLowerCase()})`}
        value={recordId}
        options={(samples ?? []).map((s): [string, string] => [s.id, s.label])}
        disabled={samples === null}
        onChange={(e) => {
          setRecordId(e.target.value)
          if (previewing) show(e.target.value)
        }}
        action={
          <div className="flex gap-2">
            {previewing ? (
              <Button type="button" variant="outline" onClick={() => onPreview(null)}>
                <PencilRuler aria-hidden="true" />
                Back to editing
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={pending || recordId === ''}
                onClick={() => show(recordId)}
              >
                <Eye aria-hidden="true" />
                Preview
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={pending || recordId === ''}
              onClick={save}
            >
              <Download aria-hidden="true" />
              Download PDF
            </Button>
          </div>
        }
      />
      <p role="status" className="m-0 text-sm">
        {pending ? 'Working' : (message ?? '')}
      </p>
    </div>
  )
}
