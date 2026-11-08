'use client'

import { type ReactNode, useId, useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { AreaField, TextField } from '@/components/staff/fields'
import { RequiredMark } from '@/components/ui/required-mark'
import type { CivilDate } from '@/types/civilDate'
import { firstResponseAction } from '../actions'

type Choice = '' | 'release' | 'time_statement' | 'website_reference' | 'denied'

const CHOICES: readonly { value: Exclude<Choice, ''>; label: string }[] = [
  { value: 'release', label: 'Release the records now' },
  { value: 'time_statement', label: 'Written statement of the time needed' },
  { value: 'website_reference', label: 'Records are posted on the town website' },
  { value: 'denied', label: 'Denied' },
]

export const DENY_REASON = 'Record a withheld record with its exemption and explanation first.'

function KindFields({ kind }: { kind: Choice }) {
  if (kind === 'website_reference') {
    return <TextField label="Web address where the records are posted" name="websiteUrl" required />
  }
  if (kind !== 'time_statement') return null
  return (
    <>
      <TextField label="Date the town will respond by" name="statedDate" type="date" required />
      <AreaField label="Why more time is needed" name="delayReason" rows={2} required />
      <TextField label="Charge, if any (what it is for)" name="costLabel" />
      <TextField label="Charge in dollars" name="costDollars" inputMode="decimal" />
    </>
  )
}

function ChoiceList({
  kind,
  canDeny,
  onChoose,
}: {
  kind: Choice
  canDeny: boolean
  onChoose: (next: Choice) => void
}) {
  const reasonId = useId()
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 font-medium">
        Response
        <RequiredMark />
      </legend>
      {CHOICES.map((c) => {
        const blocked = c.value === 'denied' && !canDeny
        return (
          <label key={c.value} className="flex items-start gap-2">
            <input
              type="radio"
              name="responseChoice"
              value={c.value}
              checked={kind === c.value}
              disabled={blocked}
              aria-describedby={blocked ? reasonId : undefined}
              onChange={() => onChoose(c.value)}
              className="mt-1 size-4 shrink-0 accent-action"
            />
            <span className={blocked ? 'text-muted-foreground' : undefined}>
              {c.label}
              {blocked ? (
                <span id={reasonId} className="block text-sm">
                  {DENY_REASON}
                </span>
              ) : null}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

function chosen(form: HTMLFormElement): string | null {
  if (new FormData(form).get('kind') !== '') return null
  document.querySelector<HTMLInputElement>('input[name="responseChoice"]:not(:disabled)')?.focus()
  return 'Choose a response.'
}

export function FirstResponseForm({
  requestId,
  today,
  canDeny,
  startOnRelease,
  releaseStep,
}: {
  requestId: string
  today: CivilDate
  canDeny: boolean
  startOnRelease: boolean
  releaseStep: ReactNode
}) {
  const [kind, setKind] = useState<Choice>(startOnRelease ? 'release' : '')
  return (
    <div className="flex flex-col gap-4">
      <ChoiceList kind={kind} canDeny={canDeny} onChoose={setKind} />
      {kind === 'release' ? (
        <div data-slot="release-step" className="flex flex-col gap-4">
          <p className="m-0 text-ink-secondary">
            The first release records the response and files its letter.
          </p>
          {releaseStep}
        </div>
      ) : (
        <ActionForm
          action={firstResponseAction}
          submitLabel="Record response"
          variant="default"
          checkBeforeSubmit={chosen}
        >
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="kind" value={kind} />
          <TextField
            label="Date of response"
            name="respondedOn"
            type="date"
            defaultValue={today}
            required
          />
          <KindFields kind={kind} />
        </ActionForm>
      )}
    </div>
  )
}
