'use client'

import { useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import type { ContractorAccountMatch, CounterActions } from '@/components/counter/counterTypes'
import { TextField } from '@/components/staff/fields'
import { attempt } from '@/lib/attempt'

type FindAccount = NonNullable<CounterActions['lookupContractor']>

function AccountMatch({ account }: { account: ContractorAccountMatch }) {
  const licenses = account.licenses.map((l) => `${l.label} ${l.number}`).join(', ')
  return (
    <p role="status" className="rounded-md border p-3 text-sm sm:col-span-2">
      {`Contractor account: ${account.companyName}, ${account.contactName}. `}
      {licenses === ''
        ? 'No license numbers on the profile.'
        : `License numbers on the profile: ${licenses}.`}
      {' This permit will show on their contractor projects page.'}
    </p>
  )
}

export function ContractorAccountFields({
  typeKey,
  findAccount,
}: {
  typeKey: string
  findAccount: FindAccount | undefined
}) {
  const csrf = useCsrfToken()
  const [license, setLicense] = useState('')
  const [account, setAccount] = useState<ContractorAccountMatch | null>(null)
  const [, setPending] = useState(false)

  const look = async (email: string) => {
    if (findAccount === undefined || email.trim() === '') {
      setAccount(null)
      return
    }
    const data = new FormData()
    data.set('csrf_token', csrf)
    data.set('contractorEmail', email)
    data.set('typeKey', typeKey)
    const result = await attempt(() => findAccount(data), setPending)
    const found = result.ok && result.value.ok ? result.value.account : null
    setAccount(found)
    const prefill = found?.prefillLicenseNumber ?? null
    if (prefill !== null) setLicense((current) => (current.trim() === '' ? prefill : current))
  }

  return (
    <>
      <TextField
        label="Contractor email"
        type="email"
        name="contractorEmail"
        onBlur={(event) => void look(event.currentTarget.value)}
      />
      <TextField
        label="License number"
        name="licenseNumber"
        required
        value={license}
        onChange={(event) => setLicense(event.currentTarget.value)}
      />
      {account === null ? null : <AccountMatch account={account} />}
    </>
  )
}
