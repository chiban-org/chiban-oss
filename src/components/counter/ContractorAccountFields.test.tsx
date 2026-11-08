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

  it('replaces an untouched auto-filled number when the contractor changes, and clears it for no account', async () => {
    const find = vi.fn((data: FormData) =>
      Promise.resolve(
        data.get('contractorEmail') === 'b@co.example' ? matchFor('B Co', 'EL-B') : NONE,
      ),
    )
    const { email, license } = fields(find)
    lookUp(email, 'a@co.example')
    await waitFor(() => expect(find).toHaveBeenCalledTimes(1))
    lookUp(email, 'b@co.example')
    await waitFor(() => expect(license.value).toBe('EL-B'))
    lookUp(email, 'walk.in@alderpond.example')
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(license.value).toBe('')
  })

  it('never replaces a number the clerk typed over an auto-filled one', async () => {
    const find = vi.fn((data: FormData) =>
      Promise.resolve(
        data.get('contractorEmail') === 'a@co.example'
          ? matchFor('A Co', 'EL-A')
          : matchFor('B Co', 'EL-B'),
      ),
    )
    const { email, license } = fields(find)
    lookUp(email, 'a@co.example')
    await waitFor(() => expect(license.value).toBe('EL-A'))
    fireEvent.change(license, { target: { value: 'EL-TYPED' } })
    lookUp(email, 'b@co.example')
    await screen.findByText(/B Co/)
    expect(license.value).toBe('EL-TYPED')
  })

  it('drops a slow answer for an earlier email', async () => {
    const slow = deferred()
    const find = vi.fn((data: FormData) =>
      data.get('contractorEmail') === 'a@co.example'
        ? slow.promise
        : Promise.resolve(matchFor('B Co', 'EL-B')),
    )
    const { email, license } = fields(find)
    lookUp(email, 'a@co.example')
    lookUp(email, 'b@co.example')
    await waitFor(() => expect(license.value).toBe('EL-B'))
    slow.resolve(matchFor('A Co', 'EL-A'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(license.value).toBe('EL-B')
    expect(screen.getByRole('status').textContent).toContain('B Co')
  })

  it('drops a pending answer once the email is cleared', async () => {
    const slow = deferred()
    const { email, license } = fields(() => slow.promise)
    lookUp(email, 'a@co.example')
    lookUp(email, '')
    slow.resolve(matchFor('A Co', 'EL-A'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('status')).toBeNull()
    expect(license.value).toBe('')
  })
})

const NONE: ContractorLookupResult = { ok: true, account: null }

function matchFor(companyName: string, number: string): ContractorLookupResult {
  return {
    ok: true,
    account: {
      companyName,
      contactName: 'Pat',
      licenses: [{ trade: 'electrical', label: 'Electrical', number }],
      prefillLicenseNumber: number,
    },
  }
}

function lookUp(email: HTMLInputElement, value: string) {
  fireEvent.change(email, { target: { value } })
  fireEvent.blur(email)
}

function deferred() {
  let resolve: (value: ContractorLookupResult) => void = () => undefined
  const promise = new Promise<ContractorLookupResult>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
