'use client'

import { useId } from 'react'
import { FieldErrorMessage, FieldErrorsProvider, useFieldError } from '@/components/fieldErrors'
import { CheckField } from '@/components/staff/CheckField'

const FIELD = 'findingIds'

export interface FindingChoice {
  id: string
  label: string
  note?: string
}

function describedBy(ids: (string | undefined)[]): string | undefined {
  const present = ids.filter((id): id is string => id !== undefined)
  return present.length === 0 ? undefined : present.join(' ')
}

export function FindingChoices({ legend, choices }: { legend: string; choices: FindingChoice[] }) {
  const error = useFieldError(FIELD)
  const base = useId()
  return (
    <fieldset data-slot="field" className="space-y-2">
      <legend className="font-medium">{legend}</legend>
      <FieldErrorsProvider errors={{}}>
        {choices.map((choice, index) => {
          const noteId = choice.note === undefined ? undefined : `${base}-${String(index)}-note`
          const errorId = index === 0 && error !== null ? error.id : undefined
          return (
            <div key={choice.id} className="space-y-1">
              <CheckField
                label={choice.label}
                name={FIELD}
                value={choice.id}
                aria-describedby={describedBy([noteId, errorId])}
                {...(errorId === undefined ? {} : { 'aria-invalid': true })}
              />
              {noteId === undefined ? null : (
                <p id={noteId} className="m-0 ps-6 text-sm text-muted-foreground">
                  {choice.note}
                </p>
              )}
            </div>
          )
        })}
      </FieldErrorsProvider>
      <FieldErrorMessage error={error} />
    </fieldset>
  )
}
