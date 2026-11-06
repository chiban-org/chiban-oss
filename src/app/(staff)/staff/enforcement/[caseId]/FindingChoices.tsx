'use client'

import { FieldErrorMessage, FieldErrorsProvider, useFieldError } from '@/components/fieldErrors'
import { CheckField } from '@/components/staff/CheckField'

const FIELD = 'findingIds'

export function FindingChoices({
  legend,
  choices,
}: {
  legend: string
  choices: { id: string; label: string }[]
}) {
  const error = useFieldError(FIELD)
  return (
    <fieldset data-slot="field" className="space-y-2">
      <legend className="font-medium">{legend}</legend>
      <FieldErrorsProvider errors={{}}>
        {choices.map((choice, index) => (
          <CheckField
            key={choice.id}
            label={choice.label}
            name={FIELD}
            value={choice.id}
            {...(index === 0 && error !== null
              ? { 'aria-invalid': true, 'aria-describedby': error.id }
              : {})}
          />
        ))}
      </FieldErrorsProvider>
      <FieldErrorMessage error={error} />
    </fieldset>
  )
}
