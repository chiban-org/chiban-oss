'use client'

import { useRef, useState } from 'react'
import { WordingFieldList } from '@/components/config/notificationWording/WordingFieldList'
import { WordingMessageList } from '@/components/config/notificationWording/WordingMessageList'
import { WordingPreview } from '@/components/config/notificationWording/WordingPreview'
import { Area, FieldError, type FieldErrors, Input } from '@/components/config/primitives'
import { Button } from '@/components/ui/button'
import {
  currentWording,
  insertField,
  isChanged,
  withDefault,
  withWording,
} from '@/features/notifications/wording/wordingEdits'
import { WORDING_KEY_INFO, type WordingKey } from '@/features/notifications/wording/wordingKeys'
import type { NotificationWordingBody } from '@/features/notifications/wording/wordingSchema'

interface Props {
  body: NotificationWordingBody
  onChange: (next: NotificationWordingBody) => void
  errors: FieldErrors
  townName: string
}

const KEY_INFO = new Map(Object.entries(WORDING_KEY_INFO))

const BODY_HINT =
  'Leave a blank line between paragraphs. Chiban adds the link at the end unless you place {{link}}, and leaves out a paragraph when none of its fields has a value.'

const NO_LINK_HINT =
  'Leave a blank line between paragraphs. This message has no link. Chiban leaves out a paragraph when none of its fields has a value.'

export function NotificationWordingEditor({ body, onChange, errors, townName }: Props) {
  const [selected, setSelected] = useState<WordingKey>('application_submitted')
  const area = useRef<HTMLTextAreaElement>(null)
  const wording = currentWording(body, selected)
  const info = KEY_INFO.get(selected)
  const changed = isChanged(body, selected)
  const insert = (field: string) => {
    const at = area.current?.selectionStart ?? wording.body.length
    const next = insertField(wording.body, at, field)
    onChange(withWording(body, selected, { body: next.text }))
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(next.caret, next.caret)
    })
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <WordingMessageList body={body} selected={selected} onSelect={setSelected} errors={errors} />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0">{info?.label}</h2>
          <p className="m-0 text-sm text-muted-foreground">
            {changed ? 'Changed from the standard wording' : 'Standard wording'}
          </p>
        </div>
        <div>
          <Input
            label="Subject"
            value={wording.subject}
            onChange={(e) => onChange(withWording(body, selected, { subject: e.target.value }))}
          />
          <FieldError errors={errors} name={`events.${selected}.subject`} />
        </div>
        <div>
          <Area
            ref={area}
            label="Message"
            hint={info?.link === 'none' ? NO_LINK_HINT : BODY_HINT}
            rows={8}
            value={wording.body}
            onChange={(e) => onChange(withWording(body, selected, { body: e.target.value }))}
          />
          <FieldError errors={errors} name={`events.${selected}.body`} />
        </div>
        <WordingFieldList fieldKey={selected} onInsert={insert} />
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={!changed}
          onClick={() => onChange(withDefault(body, selected))}
        >
          Reset to the standard wording
        </Button>
        <WordingPreview wording={wording} townName={townName} fieldKey={selected} />
      </div>
    </div>
  )
}
