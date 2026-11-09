'use client'

import { ATTEST_ID } from '@/components/portal/formValues'
import { Checkbox, CheckLine } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const ERROR_ID = 'attest-error'

export function AttestBox({
  text,
  checked,
  error,
  onChange,
}: {
  text: string
  checked: boolean
  error: string | undefined
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-4">
      <div className="flex items-start gap-3 text-base leading-snug">
        <CheckLine>
          <Checkbox
            id={ATTEST_ID}
            checked={checked}
            aria-invalid={error !== undefined}
            aria-describedby={error === undefined ? undefined : ERROR_ID}
            onCheckedChange={(next) => onChange(next === true)}
          />
        </CheckLine>
        <Label htmlFor={ATTEST_ID} className="text-base leading-snug">
          {text}
        </Label>
      </div>
      {error === undefined ? null : (
        <p id={ERROR_ID} className="m-0 text-base font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
