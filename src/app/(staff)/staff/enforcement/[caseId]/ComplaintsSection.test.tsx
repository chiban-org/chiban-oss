// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import { ALL_CAN, fillField, openSection, renderForm, stubDetail } from '@/test/enforcementRender'

vi.mock('../publishActions', () => ({
  complaintPublicTextAction: vi.fn(),
  publishCaseAction: vi.fn(),
  unpublishCaseAction: vi.fn(),
}))

const { ComplaintsSection } = await import('./ComplaintsSection')
const { complaintPublicTextAction } = await import('../publishActions')

afterEach(cleanup)

const complaint = {
  id: 'k1',
  number: 'CP-2027-0001',
  channel: 'staff_entry',
  receivedOn: '2027-07-01',
  complainantName: null,
  complainantEmail: null,
  complainantPhone: null,
  descriptionOriginal: 'Trucks idle all night.',
  descriptionPublic: null,
}

describe('writing the public text of a complaint', () => {
  it('shows a refused text beside the public text field', async () => {
    const message = 'Enter the public text of 5000 characters or fewer.'
    vi.mocked(complaintPublicTextAction).mockResolvedValue(refusal('text', message))
    const detail = stubDetail({ staff: { ...stubDetail().staff, complaints: [complaint] } })
    renderForm(<ComplaintsSection detail={detail} can={ALL_CAN} />)
    openSection('Write the public text')
    fillField(/^Public text\./, 'Something')
    fireEvent.click(screen.getByRole('button', { name: 'Save public text' }))
    await expectRefusalBeside(screen.getByLabelText(/^Public text\./), message)
  })
})

describe('the case visibility control', () => {
  it('is no longer inside the complaints panel', () => {
    renderForm(<ComplaintsSection detail={stubDetail()} can={ALL_CAN} />)
    expect(screen.queryByText('Show the case on the public site')).toBeNull()
  })
})
