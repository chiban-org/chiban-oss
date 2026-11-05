// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { CounterActions } from '@/components/counter/counterTypes'
import { QuickIssueForm } from '@/components/counter/QuickIssueForm'

beforeEach(() => {
  window.open = () => null
})
afterEach(cleanup)

const notUsed = () => Promise.resolve({ ok: false as const, error: 'not used' })

const actions: CounterActions = {
  issue: () =>
    Promise.resolve({
      ok: true,
      state: 'issued',
      number: 'EL-2027-0001',
      applicationId: 'a1',
      attemptId: null,
      links: { permit: '/p', placard: '/pl', receipt: '/r' },
    }),
  reader: notUsed,
  check: notUsed,
  reconnect: notUsed,
  complete: notUsed,
  claim: () => Promise.resolve({ ok: true, message: 'Sent.' }),
}

function issue() {
  render(
    <CsrfProvider token="t1">
      <QuickIssueForm
        parcelId="p1"
        typeKey="EL"
        typeLabel="Electrical permit"
        parcelLabel="007001000000, 12 Heron Cove Road"
        summary={<p>Chosen so far</p>}
        fields={[]}
        baseCents={4500}
        convenienceFee={{ basisPoints: 300, fixedCents: 0, appliesTo: ['card_present'] }}
        cardAvailable={false}
        readerSimulated={false}
        licenseGroups={[{ label: 'Electrical', licenses: ['Master electrician'] }]}
        defaultLicenseType="Master electrician"
        lookup={{ label: 'License lookup', url: 'https://example.test' }}
        actions={actions}
      />
    </CsrfProvider>,
  )
  fireEvent.change(screen.getByLabelText(/^Contractor name( \*)?$/), {
    target: { value: 'Pat Volt' },
  })
  fireEvent.change(screen.getByLabelText(/^License number( \*)?$/), { target: { value: 'EL-1' } })
  fireEvent.change(screen.getByLabelText(/^Result of the state lookup( \*)?$/), {
    target: { value: 'active' },
  })
  fireEvent.click(screen.getByLabelText('Check'))
  fireEvent.click(screen.getByRole('button', { name: 'Issue and print' }))
  return waitFor(() => screen.getByRole('region', { name: 'EL-2027-0001 is issued' }))
}

describe('issued panel', () => {
  it('replaces the filled form and the chosen steps', async () => {
    await issue()
    expect(screen.queryByLabelText(/^Contractor name( \*)?$/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Issue and print' })).toBeNull()
    expect(screen.queryByText('Chosen so far')).toBeNull()
  })

  it('names the permit, parcel, contractor and what was paid', async () => {
    const panel = await issue()
    const text = panel.textContent
    expect(text).toContain('Electrical permit')
    expect(text).toContain('007001000000, 12 Heron Cove Road')
    expect(text).toContain('Pat Volt')
    expect(text).toContain('$45.00 by check')
  })

  it('opens the permit, placard and receipt in a new tab', async () => {
    const panel = await issue()
    for (const [name, href] of [
      ['Permit', '/p'],
      ['Placard', '/pl'],
      ['Receipt', '/r'],
    ] as const) {
      const link = within(panel).getByRole('link', { name })
      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
    }
  })

  it('offers the claim link, another permit from the start, and the application record', async () => {
    const panel = await issue()
    expect(
      within(panel).getByRole('button', { name: 'Send claim link to contractor' }),
    ).toBeTruthy()
    expect(
      within(panel).getByRole('link', { name: 'Issue another permit' }).getAttribute('href'),
    ).toBe('/staff/counter')
    expect(
      within(panel).getByRole('link', { name: 'Open the application record' }).getAttribute('href'),
    ).toBe('/staff/applications/a1')
  })
})
