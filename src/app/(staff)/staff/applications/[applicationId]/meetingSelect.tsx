'use client'

import { useEffect, useId, useState } from 'react'
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
  const id = useId()
  const [chosen, setChosen] = useState(defaultValue)
  useEffect(() => {
    const select = document.getElementById(id)
    const form = select instanceof HTMLSelectElement ? select.form : null
    if (form === null || !(select instanceof HTMLSelectElement)) return
    const followReset = () => queueMicrotask(() => setChosen(select.value))
    form.addEventListener('reset', followReset)
    return () => form.removeEventListener('reset', followReset)
  }, [id])
  return (
    <SelectField
      id={id}
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
