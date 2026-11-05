'use client'

import { Check, RowButton } from '@/components/config/primitives'
import { RequiredMark } from '@/components/ui/required-mark'
import type { NamedChoice } from '@/features/config/referenceChoices'

const LONG_LIST = 10

function choiceText(choice: NamedChoice): string {
  return choice.note === undefined ? choice.label : `${choice.label} (${choice.note})`
}

export function CheckedNames({
  legend,
  hint,
  values,
  choices,
  onChange,
  empty,
  required,
}: {
  legend: string
  hint?: string
  required?: boolean
  values: readonly string[]
  choices: readonly NamedChoice[]
  onChange: (next: string[]) => void
  empty: string
}) {
  const known = (v: string) => choices.some((c) => c.key === v)
  const missing = values.filter((v) => !known(v))
  const ticked = choices.filter((c) => values.includes(c.key))
  const checks = choices.map((choice) => (
    <Check
      key={choice.key}
      label={choiceText(choice)}
      checked={values.includes(choice.key)}
      onChange={(on) =>
        onChange(on ? [...values, choice.key] : values.filter((v) => v !== choice.key))
      }
    />
  ))
  return (
    <div className="grid content-start gap-2">
      <p className="m-0 text-sm font-medium">
        {legend}
        {required === true ? <RequiredMark /> : null}
      </p>
      {hint === undefined ? null : <p className="m-0 text-sm text-muted-foreground">{hint}</p>}
      {choices.length === 0 ? <p className="m-0 text-sm text-muted-foreground">{empty}</p> : null}
      {choices.length > LONG_LIST ? (
        <>
          <p className="m-0 text-sm">
            {ticked.length === 0 ? 'None chosen.' : `Chosen: ${ticked.map(choiceText).join(', ')}.`}
          </p>
          <details>
            <summary className="cursor-pointer text-sm font-medium">{`Choose from all ${String(choices.length)}`}</summary>
            <div className="mt-2 grid gap-1">{checks}</div>
          </details>
        </>
      ) : (
        checks
      )}
      {missing.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0 text-sm text-status-overdue-fg">
            {missing.length === 1
              ? 'One choice no longer exists.'
              : `${String(missing.length)} choices no longer exist.`}
          </p>
          <RowButton onClick={() => onChange(values.filter(known))}>Remove them</RowButton>
        </div>
      )}
    </div>
  )
}
