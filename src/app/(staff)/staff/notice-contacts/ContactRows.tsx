'use client'

import { useRef, useState } from 'react'
import { AddressTextField } from '@/components/address/AddressTextField'
import { TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'

export interface PersonRow {
  id?: string
  name: string
  middle: string
  mailingAddress: string
}

interface Shape {
  noun: string
  middleLabel: string
  fields: { id?: string; name: string; middle: string; address: string }
}

const OFFICER: Shape = {
  noun: 'officer',
  middleLabel: 'Title',
  fields: { name: 'officerName', middle: 'officerTitle', address: 'officerAddress' },
}

const TENANT: Shape = {
  noun: 'tenant',
  middleLabel: 'Site',
  fields: { id: 'tenantId', name: 'tenantName', middle: 'tenantSite', address: 'tenantAddress' },
}

const EMPTY: PersonRow = { name: '', middle: '', mailingAddress: '' }

interface RowsProps {
  kind: 'officer' | 'tenant'
  initial: readonly PersonRow[]
}

export function ContactRows(props: RowsProps) {
  return <Rows key={JSON.stringify(props.initial)} {...props} />
}

function Rows({ kind, initial }: RowsProps) {
  const shape = kind === 'officer' ? OFFICER : TENANT
  const next = useRef(initial.length + 1)
  const [rows, setRows] = useState(() =>
    (initial.length === 0 ? [EMPTY] : initial).map((row, i) => ({ key: i, row })),
  )
  const label = kind === 'officer' ? 'Officer' : 'Tenant'
  return (
    <div className="space-y-3">
      {rows.map(({ key, row }, index) => (
        <fieldset key={key} className="space-y-3 rounded-md border border-hairline p-3">
          <legend className="px-1 text-sm font-semibold">{`${label} ${index + 1}`}</legend>
          {shape.fields.id === undefined ? null : (
            <input type="hidden" name={shape.fields.id} value={row.id ?? ''} />
          )}
          <TextField label="Name" name={shape.fields.name} defaultValue={row.name} required />
          <TextField
            label={shape.middleLabel}
            name={shape.fields.middle}
            defaultValue={row.middle}
          />
          <AddressTextField
            label="Mailing address"
            name={shape.fields.address}
            defaultValue={row.mailingAddress}
            required
          />
          {rows.length === 1 ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove ${shape.noun} ${index + 1}`}
              onClick={() => setRows((current) => current.filter((r) => r.key !== key))}
            >
              Remove
            </Button>
          )}
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          next.current += 1
          setRows((current) => [...current, { key: next.current, row: EMPTY }])
        }}
      >
        {`Add another ${shape.noun}`}
      </Button>
    </div>
  )
}
