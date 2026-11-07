'use client'

import { useState } from 'react'
import { SelectField } from '@/components/staff/fields'

export interface MeetingOption {
  value: string
  text: string
  hint: string | undefined
}

export function MeetingSelect({
  label,
  options,
  defaultValue,
}: {
  label: string
  options: readonly MeetingOption[]
  defaultValue: string
}) {
  const [chosen, setChosen] = useState(defaultValue)
  return (
    <SelectField
      label={label}
      name="meetingId"
      defaultValue={defaultValue}
      required
      hint={options.find((o) => o.value === chosen)?.hint}
      onChange={(event) => setChosen(event.target.value)}
      options={[
        ['', 'Choose an upcoming meeting'],
        ...options.map((o): [string, string] => [o.value, o.text]),
      ]}
    />
  )
}
