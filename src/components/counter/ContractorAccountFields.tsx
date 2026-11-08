'use client'

import { useRef, useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import type { ContractorAccountMatch, CounterActions } from '@/components/counter/counterTypes'
import { TextField } from '@/components/staff/fields'
import { attempt } from '@/lib/attempt'

type FindAccount = NonNullable<CounterActions['lookupContractor']>

function AccountMatch({ account }: { account: ContractorAccountMatch }) {
  const licenses = account.licenses.map((l) => `${l.label} ${l.number}`).join(', ')
  return (
    <p role="status" className="rounded-md border p-3 text-sm sm:order-last sm:col-span-2">
      {`Contractor account: ${account.companyName}, ${account.contactName}. `}
      {licenses === ''
        ? 'No license numbers on the profile.'
        : `License numbers on the profile: ${licenses}.`}
      {' This permit will show on their contractor projects page.'}
    </p>
  )
}

function nextLicense(current: string, autoFilled: string | null, prefill: string | null): string {
  const typed = current.trim() !== '' && current !== autoFilled
  return typed ? current : (prefill ?? '')
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
  const generation = useRef(0)
  const autoFilled = useRef<string | null>(null)

  const settle = (found: ContractorAccountMatch | null) => {
    const prefill = found?.prefillLicenseNumber ?? null
    const previous = autoFilled.current
    autoFilled.current = prefill
    setAccount(found)
    setLicense((current) => nextLicense(current, previous, prefill))
  }

  const look = async (email: string) => {
    generation.current += 1
    const asked = generation.current
    if (findAccount === undefined || email.trim() === '') {
      settle(null)
      return
    }
    const data = new FormData()
    data.set('csrf_token', csrf)
    data.set('contractorEmail', email)
    data.set('typeKey', typeKey)
    const result = await attempt(() => findAccount(data), setPending)
    if (asked !== generation.current) return
    settle(result.ok && result.value.ok ? result.value.account : null)
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
