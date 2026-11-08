'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useCsrfToken } from '@/components/CsrfProvider'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import type { ClosingCopy } from '@/features/inspections/closingCopy'
import { attempt } from '@/lib/attempt'
import type { ActionResult } from '@/server/actionRunner'

export type Outcome = 'pass' | 'fail' | 'na'

export interface ChecklistFormItem {
  key: string
  label: string
  required: boolean
  outcome: Outcome | null
  note: string
}

const OPTIONS: readonly (readonly [Outcome, string])[] = [
  ['pass', 'Pass'],
  ['fail', 'Fail'],
  ['na', 'N/A'],
]

const MIN_FAIL_NOTES = 10
const REQUIRED_NA = 'A required item is N/A. Mark it Pass or Fail.'
const FINAL_RESULT = 'A result cannot be changed once it is recorded.'

function resultLine(failed: boolean, requiredNa: boolean, requiredAnswered: boolean): string {
  if (failed) return 'Result: Failed'
  if (requiredNa) return REQUIRED_NA
  return requiredAnswered ? 'Result: Passed' : 'Result: answer the required items first'
}

function confirmCopy(name: string, failed: boolean, closing: ClosingCopy | null) {
  const result = failed ? 'failed' : 'passed'
  const effect = !failed && closing !== null ? `${closing.confirm} ` : ''
  return {
    title: `Record the ${name} as ${result}?`,
    body: `${effect}${FINAL_RESULT}`,
    confirmLabel: `Record as ${result}`,
    cancelLabel: 'Keep editing',
    tone: 'default' as const,
  }
}

export function ChecklistForm({
  inspectionId,
  rowVersion,
  items,
  action,
  initialNotes,
  name,
  closing,
}: {
  inspectionId: string
  rowVersion: number
  items: ChecklistFormItem[]
  action: (formData: FormData) => Promise<ActionResult>
  initialNotes: string
  name: string
  closing: ClosingCopy | null
}) {
  const csrf = useCsrfToken()
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, Outcome | null>>(
    Object.fromEntries(items.map((i) => [i.key, i.outcome])),
  )
  const [itemNotes, setItemNotes] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.key, i.note])),
  )
  const [notes, setNotes] = useState(initialNotes)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const failed = items.some((i) => answers[i.key] === 'fail')
  const requiredAnswered = items.every((i) => !i.required || answers[i.key] != null)
  const requiredNa = !failed && items.some((i) => i.required && answers[i.key] === 'na')
  const notesOk = !failed || notes.trim().length >= MIN_FAIL_NOTES
  const ready = requiredAnswered && !requiredNa && notesOk

  const submit = async () => {
    const data = new FormData()
    data.set('csrf_token', csrf)
    data.set('inspectionId', inspectionId)
    data.set('expectedRowVersion', String(rowVersion))
    data.set('result', failed ? 'failed' : 'passed')
    data.set('notes', notes)
    for (const item of items) {
      const answer = answers[item.key]
      if (answer == null) continue
      data.set(`item:${item.key}`, answer)
      const note = itemNotes[item.key] ?? ''
      if (note.trim() !== '') data.set(`note:${item.key}`, note)
    }
    setMessage(null)
    const result = await attempt(() => action(data), setPending)
    if (!result.ok) return setMessage(result.error)
    setMessage(result.value.ok ? result.value.message : result.value.error)
    if (result.value.ok) toast.success(result.value.message)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {items.map((item) => (
        <fieldset key={item.key} className="space-y-2 border-0 p-0">
          <legend className="font-medium">
            {item.label}
            {item.required ? null : <span className="ml-2 font-normal">(optional)</span>}
          </legend>
          <RadioGroup
            aria-label={item.label}
            value={answers[item.key] ?? ''}
            onValueChange={(value) => setAnswers({ ...answers, [item.key]: value as Outcome })}
            className="grid-cols-3 gap-2"
          >
            {OPTIONS.map(([value, label]) => {
              const id = `${item.key}-${value}`
              return (
                <Label
                  key={value}
                  htmlFor={id}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-base"
                >
                  <RadioGroupItem id={id} value={value} className="size-5" />
                  {label}
                </Label>
              )
            })}
          </RadioGroup>
          {answers[item.key] === 'fail' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${item.key}-note`} className="text-base font-medium">
                {`Note on ${item.label}`}
              </Label>
              <Textarea
                id={`${item.key}-note`}
                value={itemNotes[item.key] ?? ''}
                onChange={(e) => setItemNotes({ ...itemNotes, [item.key]: e.target.value })}
                className="min-h-11 text-base"
              />
            </div>
          ) : null}
        </fieldset>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="result-notes" className="text-base font-medium">
          Notes for the permit holder
        </Label>
        <Textarea
          id="result-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-24 text-base"
        />
        {failed && !notesOk ? <p>Write at least 10 characters about what failed.</p> : null}
      </div>
      <p className="font-semibold">{resultLine(failed, requiredNa, requiredAnswered)}</p>
      {closing === null ? null : <p>{closing.note}</p>}
      <Button
        type="button"
        className="min-h-11 w-full text-base"
        disabled={!ready || pending}
        onClick={() => setConfirming(true)}
      >
        Record result
      </Button>
      <ConfirmDialog
        open={confirming}
        copy={confirmCopy(name, failed, closing)}
        onConfirm={() => {
          setConfirming(false)
          void submit()
        }}
        onCancel={() => setConfirming(false)}
      />
      {message === null ? null : (
        <p role="status" className="text-base">
          {message}
        </p>
      )}
    </div>
  )
}
