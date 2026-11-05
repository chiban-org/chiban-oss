// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { CorrectPermitDialog } from '@/components/permits/CorrectPermitDialog'
import type { CheckOutcome } from '@/components/permits/useCorrectionCheck'
import type { CorrectionFormData } from '@/features/permits/correction/correctionForm'

afterEach(cleanup)

const DATA: CorrectionFormData = {
  applicationId: '00000000-0000-4000-8000-000000000001',
  number: 'PL-2026-0005',
  nextRevision: 1,
  form: {
    key: 'pl-form',
    label: 'Plumbing permit application',
    fields: [
      { key: 'description', label: 'Description of work', type: 'textarea', required: true },
    ],
  },
  values: { description: 'Water heater', contractor_license_number: 'MP-1' },
  licenseField: { label: 'Contractor license number', required: true },
  projectTitle: 'Water heater',
  contractor: { id: 'c1', name: 'Pipe Co' },
  otherParties: [{ id: 'o1', label: 'Robin Owner (owner)' }],
  amendedHref: '/staff/counter?parcel=p1&type=PL',
}

function open(outcome: CheckOutcome) {
  const check = vi.fn(() => Promise.resolve(outcome))
  const save = vi.fn(() => Promise.resolve({ ok: true as const, message: 'Saved.' }))
  render(
    <CsrfProvider token="t">
      <CorrectPermitDialog data={DATA} actions={{ check, save }} />
    </CsrfProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Correct this permit' }))
  return { check, save }
}

describe('CorrectPermitDialog', () => {
  it('shows the fee check, who is notified and the revision it saves as', async () => {
    const { check } = open({
      ok: true,
      feeLine: 'No fee changes',
      refusal: null,
      notify: ['Avery Stone', 'Pipe Co'],
      fieldErrors: {},
    })
    expect(await screen.findByText('No fee changes')).toBeTruthy()
    expect(screen.getByText('Will notify: Avery Stone, Pipe Co')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save and reissue as revision 1' })).toBeTruthy()
    expect(screen.getByDisplayValue('MP-1')).toBeTruthy()
    const sent = check.mock.calls.at(-1) as unknown as [FormData]
    expect(JSON.parse(sent[0].get('values') as string)).toMatchObject({
      contractor_license_number: 'MP-1',
    })
  })

  it('does not send a change the check refused', async () => {
    const refusal = 'This would change the fees, so it is not a correction.'
    const { save } = open({ ok: true, feeLine: refusal, refusal, notify: [], fieldErrors: {} })
    expect(await screen.findAllByText(refusal)).not.toHaveLength(0)
    fireEvent.change(screen.getByLabelText(/Reason for the correction/), {
      target: { value: 'Typo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save and reissue as revision 1' }))
    expect(save).not.toHaveBeenCalled()
  })

  it('links to an amended application for changes that are not corrections', () => {
    open({ ok: true, feeLine: 'No fee changes', refusal: null, notify: [], fieldErrors: {} })
    const link = screen.getByRole('link', { name: 'Start an amended application' })
    expect(link.getAttribute('href')).toBe('/staff/counter?parcel=p1&type=PL')
  })
})
