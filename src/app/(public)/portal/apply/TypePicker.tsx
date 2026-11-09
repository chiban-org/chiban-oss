'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { CommonJob, TypeGroup } from '@/features/portal/typeGroups'
import { startApplicationAction } from './actions'

function Choice({
  value,
  label,
  description,
}: {
  value: string
  label: string
  description?: string
}) {
  const id = `type-${value}`
  return (
    <div className="flex min-h-11 items-start gap-3 py-1">
      <RadioGroupItem id={id} value={value} className="mt-1.5" />
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5 text-base leading-snug">
        <span className="font-semibold">{label}</span>
        {description === undefined ? null : (
          <span className="font-normal text-ink-secondary">{description}</span>
        )}
      </Label>
    </div>
  )
}

export function TypePicker({
  parcelId,
  grouped,
}: {
  parcelId: string
  grouped: { common: CommonJob[]; groups: TypeGroup[] }
}) {
  const [chosen, setChosen] = useState('')
  return (
    <ActionForm
      action={startApplicationAction}
      submitLabel="Continue"
      variant="default"
      submitDisabled={chosen === ''}
    >
      <input type="hidden" name="parcelId" value={parcelId} />
      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="mb-2 text-lg font-semibold">What is the work?</legend>
        <RadioGroup name="typeKey" value={chosen} onValueChange={setChosen} className="gap-1">
          {grouped.common.map((job) => (
            <Choice key={job.key} value={job.key} label={job.title} description={job.description} />
          ))}
          {grouped.groups.length === 0 ? null : (
            <p className="mt-4 mb-1 font-medium">Something else? Choose who decides it.</p>
          )}
          {grouped.groups.map((group) => (
            <details key={group.title} className="border-t border-hairline py-1">
              <summary className="tap-target inline-flex cursor-pointer items-center font-medium">
                {`${group.title} (${group.types.length})`}
              </summary>
              <div className="flex flex-col gap-1 pb-2 pl-1">
                {group.types.map((type) => (
                  <Choice key={type.key} value={type.key} label={type.label} />
                ))}
              </div>
            </details>
          ))}
        </RadioGroup>
      </fieldset>
    </ActionForm>
  )
}
