// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { ContractorAccountFields } from '@/components/counter/ContractorAccountFields'
import type { ContractorLookupResult } from '@/components/counter/counterTypes'

afterEach(cleanup)

const MATCH: ContractorLookupResult = {
  ok: true,
  account: {
    companyName: 'Builder and Sons',
    contactName: 'Pat Builder',
    licenses: [
      { trade: 'electrical', label: 'Electrical', number: 'EL-20418' },
      { trade: 'plumbing', label: 'Plumbing', number: 'PL-3301' },
    ],
    prefillLicenseNumber: 'EL-20418',
  },
}

function fields(find: (data: FormData) => Promise<ContractorLookupResult>) {
  render(
    <CsrfProvider token="t1">
      <ContractorAccountFields typeKey="EL" findAccount={find} />
    </CsrfProvider>,
  )
  return {
    email: screen.getByLabelText<HTMLInputElement>(/^Contractor email/),
    license: screen.getByLabelText<HTMLInputElement>(/^License number/),
  }
}

describe('contractor account lookup on the quick issue form', () => {
  it('shows the company and license numbers and fills an empty license number', async () => {
    const find = vi.fn((_data: FormData) => Promise.resolve(MATCH))
    const { email, license } = fields(find)
    fireEvent.change(email, { target: { value: 'pat@builder.example' } })
    fireEvent.blur(email)
    await waitFor(() => expect(license.value).toBe('EL-20418'))
    const sent = find.mock.calls[0]?.[0]
    expect(sent?.get('contractorEmail')).toBe('pat@builder.example')
    expect(sent?.get('typeKey')).toBe('EL')
    expect(sent?.get('csrf_token')).toBe('t1')
    expect(screen.getByRole('status').textContent).toContain(
      'Contractor account: Builder and Sons, Pat Builder. License numbers on the profile: Electrical EL-20418, Plumbing PL-3301.',
    )
  })

  it('keeps a license number the clerk already typed', async () => {
    const { email, license } = fields(() => Promise.resolve(MATCH))
    fireEvent.change(license, { target: { value: 'EL-1' } })
    fireEvent.change(email, { target: { value: 'pat@builder.example' } })
    fireEvent.blur(email)
    await screen.findByRole('status')
    expect(license.value).toBe('EL-1')
  })

  it('shows nothing for an email without a contractor account and skips a blank email', async () => {
    const find = vi.fn((_data: FormData) =>
      Promise.resolve<ContractorLookupResult>({ ok: true, account: null }),
    )
    const { email, license } = fields(find)
    fireEvent.blur(email)
    expect(find).not.toHaveBeenCalled()
    fireEvent.change(email, { target: { value: 'walk.in@alderpond.example' } })
    fireEvent.blur(email)
    await waitFor(() => expect(find).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('status')).toBeNull()
    expect(license.value).toBe('')
  })
})
