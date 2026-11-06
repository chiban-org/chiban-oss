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
      {kind === 'website_reference' ? (
        <TextField label="Web address where the records are posted" name="websiteUrl" required />
      ) : null}
      {kind === 'time_statement' ? (
        <>
          <TextField label="Date the town will respond by" name="statedDate" type="date" required />
          <AreaField label="Why more time is needed" name="delayReason" rows={2} required />
          <TextField label="Charge, if any (what it is for)" name="costLabel" />
          <TextField label="Charge in dollars" name="costDollars" inputMode="decimal" />
        </>
      ) : null}
    </>
  )
}
