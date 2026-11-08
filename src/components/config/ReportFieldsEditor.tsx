'use client'

import { useActionState, useState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { type DiscardOffer, PublishBar } from '@/components/config/PublishBar'
import { Check, FieldError } from '@/components/config/primitives'
import { Legend } from '@/components/ui/legend'
import { useHydrated } from '@/components/useHydrated'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { ReportFieldColumn } from '@/features/reports/reportFields'
import type { ActionResult } from '@/server/actionRunner'

const TYPE_TEXT: Record<ReportFieldColumn['type'], string> = {
  integer: 'whole number',
  decimal: 'number',
  money: 'dollar amount',
}

interface Props {
  typeKey: string
  initialBody: ApplicationTypeBody
  offered: ReportFieldColumn[]
  saveAction: (formData: FormData) => Promise<ActionResult>
  publishAction: (formData: FormData) => Promise<ActionResult>
  discard?: DiscardOffer & { action: (formData: FormData) => Promise<ActionResult> }
}

export function ReportFieldsEditor({
  typeKey,
  initialBody,
  offered,
  saveAction,
  publishAction,
  discard,
}: Props) {
  const offeredKeys = new Set(offered.map((f) => f.key))
  const [chosen, setChosen] = useState<string[]>(
    (initialBody.reportFields ?? []).filter((key) => offeredKeys.has(key)),
  )
  const hydrated = useHydrated()
  const body: ApplicationTypeBody = { ...initialBody, reportFields: chosen }
  const [result, run, pending] = useActionState(
    async (_previous: ActionResult | null, formData: FormData) => {
      const intent = formData.get('intent')
      if (intent === 'discard' && discard !== undefined) return await discard.action(formData)
      return intent === 'publish' ? await publishAction(formData) : await saveAction(formData)
    },
    null,
  )
  const fieldErrors = result !== null && !result.ok ? (result.fieldErrors ?? {}) : {}
  const toggle = (key: string, on: boolean) =>
    setChosen(offered.map((f) => f.key).filter((k) => (k === key ? on : chosen.includes(k))))
  return (
    <form action={run} className="max-w-3xl space-y-4">
      <CsrfField />
      <input type="hidden" name="kind" value="application_type" />
      <input type="hidden" name="key" value={typeKey} />
      <input type="hidden" name="body" value={JSON.stringify(body)} />
      <fieldset className="space-y-2 rounded-md border p-3">
        <Legend bordered>Columns to add</Legend>
        {offered.length === 0 ? (
          <p className="text-sm">
            The application form for this type has no number or dollar questions yet. Add one to the
            form, then come back to choose it here.
          </p>
        ) : (
          offered.map((field) => (
            <Check
              key={field.key}
              label={`${field.label} (${TYPE_TEXT[field.type]})`}
              checked={chosen.includes(field.key)}
              onChange={(on) => toggle(field.key, on)}
            />
          ))
        )}
      </fieldset>
      <FieldError errors={fieldErrors} name="reportFields" />
      <FieldError errors={fieldErrors} name="_form" />
      <PublishBar
        pinned
        {...(discard === undefined ? {} : { discard })}
        disabled={pending || !hydrated}
        status={
          pending ? 'Working' : result === null ? null : result.ok ? result.message : result.error
        }
      />
    </form>
  )
}
