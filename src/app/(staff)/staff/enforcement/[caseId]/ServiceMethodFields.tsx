'use client'

import { useState } from 'react'
import { SelectField, TextField } from '@/components/staff/fields'
import { SERVER_ROLE_LABELS, SERVICE_METHOD_LABELS } from '@/features/enforcement/labels'
import type { ServiceMethod } from '@/features/enforcement/serviceStatus'

const METHODS = Object.entries(SERVICE_METHOD_LABELS) as [string, string][]
const SERVERS: [string, string][] = [
  ['', 'Choose'],
  ...(Object.entries(SERVER_ROLE_LABELS) as [string, string][]),
]
const BY_A_SERVER: readonly ServiceMethod[] = ['in_hand', 'abode', 'other_civil_summons_method']
const PUBLICATION: ServiceMethod = 'newspaper_publication'

function isMethod(value: string): value is ServiceMethod {
  return Object.hasOwn(SERVICE_METHOD_LABELS, value)
}

export function ServiceMethodFields({ defaultMethod }: { defaultMethod: ServiceMethod }) {
  const [method, setMethod] = useState<ServiceMethod>(defaultMethod)
  return (
    <>
      <SelectField
        label="Method"
        name="method"
        options={METHODS}
        value={method}
        onChange={(event) => {
          if (isMethod(event.target.value)) setMethod(event.target.value)
        }}
      />
      {method === PUBLICATION ? (
        <TextField label="Newspaper" name="newspaper" />
      ) : (
        <TextField label="Served by (name)" name="serverName" />
      )}
      {BY_A_SERVER.includes(method) ? (
        <SelectField label="Server is a" name="serverRole" options={SERVERS} />
      ) : null}
    </>
  )
}
