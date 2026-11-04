'use client'

import { ReferenceList } from '@/components/config/formBuilder/ReferenceList'
import { Check, Input, Pick } from '@/components/config/primitives'
import type { FieldReference } from '@/features/forms/formReferences'
import type { FormField } from '@/features/forms/formSchema'
import { FACT_CHOICES } from '@/features/forms/questionTypes'

const FROZEN_HINT = 'A published version uses this key, so it stays fixed.'
const FREE_HINT = 'Made from the question text. Answers are stored under it.'

export function AdvancedSettings({
  field,
  frozen,
  references,
  onKey,
  onPatch,
}: {
  field: FormField
  frozen: boolean
  references: FieldReference[]
  onKey: (key: string) => void
  onPatch: (patch: Partial<FormField>) => void
}) {
  const isQuestion = field.type !== 'section'
  return (
    <details className="rounded-md border border-hairline p-3">
      <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
      <div className="mt-3 grid gap-3">
        <Input
          label="Key"
          value={field.key}
          disabled={frozen}
          hint={frozen ? FROZEN_HINT : FREE_HINT}
          onChange={(e) => onKey(e.target.value)}
        />
        {isQuestion ? (
          <>
            <Pick
              label="Fact"
              hint="Copies the answer into the project facts that rules read."
              value={field.fact ?? ''}
              options={FACT_CHOICES}
              onChange={(e) => {
                const fact = e.target.value
                onPatch({ fact: fact === '' ? undefined : (fact as FormField['fact']) })
              }}
            />
            <Check
              label="Staff only"
              checked={field.staffOnly === true}
              onChange={(on) => onPatch({ staffOnly: on ? true : undefined })}
            />
          </>
        ) : null}
        <div>
          <p className="m-0 mb-1 text-sm font-medium">Used by</p>
          {references.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Nothing else uses this yet.</p>
          ) : (
            <>
              {frozen ? null : (
                <p className="m-0 mb-2 text-sm text-status-overdue-fg">
                  Changing the key stops these from finding the answer.
                </p>
              )}
              <ReferenceList references={references} />
            </>
          )}
        </div>
      </div>
    </details>
  )
}
