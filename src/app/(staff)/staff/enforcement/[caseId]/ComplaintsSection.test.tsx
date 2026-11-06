// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { expectRefusalBeside } from '@/test/besideField'
import { ALL_CAN, fillField, openSection, renderForm, stubDetail } from '@/test/enforcementRender'
import { refusal } from '@/test/refusalBeside'

vi.mock('../publishActions', () => ({
  complaintPublicTextAction: vi.fn(),
  publishCaseAction: vi.fn(),
  unpublishCaseAction: vi.fn(),
}))

const { ComplaintsSection } = await import('./ComplaintsSection')
const { complaintPublicTextAction, publishCaseAction } = await import('../publishActions')

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

describe('making a case public', () => {
  it('shows a refused summary beside the summary field', async () => {
    const message = 'Enter a public summary of 1000 characters or fewer.'
    vi.mocked(publishCaseAction).mockResolvedValue(refusal('summary', message))
    renderForm(<ComplaintsSection detail={stubDetail()} can={ALL_CAN} />)
    openSection('Make the case public')
    fillField(/^Public summary/, 'Something')
    fireEvent.click(screen.getByRole('button', { name: 'Make case public' }))
    await expectRefusalBeside(screen.getByLabelText(/^Public summary/), message)
  })
})
