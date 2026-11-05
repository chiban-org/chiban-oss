'use client'

import { useState } from 'react'
import type { LicenseGroup } from '@/components/counter/counterTypes'
import { Field, TextField, useFieldIds } from '@/components/staff/fields'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

export const OTHER_LICENSE = '__other__'

export function initialLicenseChoice(
  value: string,
  groups: readonly LicenseGroup[],
): { choice: string; other: string } {
  if (value === '') return { choice: '', other: '' }
  const listed = groups.some((group) => group.licenses.includes(value))
  return listed ? { choice: value, other: '' } : { choice: OTHER_LICENSE, other: value }
}

export function LicenseTypeField({
  groups,
  defaultValue,
}: {
  groups: readonly LicenseGroup[]
  defaultValue: string
}) {
  const initial = initialLicenseChoice(defaultValue, groups)
  const [choice, setChoice] = useState(initial.choice)
  const { controlId } = useFieldIds(undefined)
  const other = choice === OTHER_LICENSE
  return (
    <>
      <Field label="License type" htmlFor={controlId}>
        <NativeSelect
          id={controlId}
          name={other ? undefined : 'licenseType'}
          required
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          <NativeSelectOption value="" disabled>
            Choose a license type
          </NativeSelectOption>
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.licenses.map((license) => (
                <NativeSelectOption key={license} value={license}>
                  {license}
                </NativeSelectOption>
              ))}
            </optgroup>
          ))}
          <NativeSelectOption value={OTHER_LICENSE}>Other</NativeSelectOption>
        </NativeSelect>
      </Field>
      {other ? (
        <TextField
          label="Other license type"
          name="licenseType"
          required
          defaultValue={initial.other}
        />
      ) : null}
    </>
  )
}
