'use client'

import { useState } from 'react'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import type { CivilDate } from '@/types/civilDate'

export function ResponseKindFields({
  options,
  today,
}: {
  options: readonly (readonly [string, string])[]
  today: CivilDate
}) {
  const [kind, setKind] = useState(options[0]?.[0] ?? '')
  return (
    <>
      <SelectField
        label="Response"
        name="kind"
        options={options}
        value={kind}
        onChange={(event) => setKind(event.target.value)}
      />
      <TextField
        label="Date of response"
        name="respondedOn"
        type="date"
        defaultValue={today}
        required
      />
      <TextField
        label="Web address, if posted online"
        name="websiteUrl"
        type="url"
        required={kind === 'website_reference'}
      />
      <TextField
        label="Date the town will respond by, if more time is needed"
        name="statedDate"
        type="date"
        required={kind === 'time_statement'}
      />
      <AreaField label="Why more time is needed" name="delayReason" rows={2} />
    </>
  )
}
