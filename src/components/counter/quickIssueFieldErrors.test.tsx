// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { CounterActions } from '@/components/counter/counterTypes'
import { QuickIssueForm } from '@/components/counter/QuickIssueForm'
import { expectRefusalBeside } from '@/test/besideField'

afterEach(cleanup)

const MESSAGE = 'Enter the contractor name.'

const actions: CounterActions = {
  issue: () =>
    Promise.resolve({ ok: false, error: MESSAGE, fieldErrors: { contractorName: MESSAGE } }),
  reader: vi.fn(),
  check: vi.fn(),
  reconnect: vi.fn(),
  complete: vi.fn(),
}

describe('QuickIssueForm refusals', () => {
  it('shows a refused contractor name beside the contractor name field', async () => {
    render(
      <CsrfProvider token="t1">
        <QuickIssueForm
          parcelId="p1"
          typeKey="EL"
          typeLabel="Electrical permit"
          parcelLabel="007001000000"
          summary={null}
          fields={[]}
          baseCents={4500}
          convenienceFee={{ basisPoints: 0, fixedCents: 0, appliesTo: [] }}
          cardAvailable={false}
          readerSimulated={false}
          licenseRequired={true}
          licenseGroups={[{ label: 'Electrical', licenses: ['Master electrician'] }]}
          defaultLicenseType="Master electrician"
          lookup={{ label: 'Lookup', url: 'https://forms.nh.gov/licenseverification/Search.aspx' }}
          actions={actions}
        />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Issue and print' }))
    await expectRefusalBeside(screen.getByRole('textbox', { name: /Contractor name/ }), MESSAGE)
  })
})
