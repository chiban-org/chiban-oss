// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import { ALL_CAN, fillField, openSection, renderForm, stubDetail } from '@/test/enforcementRender'

vi.mock('../publishActions', () => ({
  attachComplaintAction: vi.fn(),
  complaintPublicTextAction: vi.fn(),
  publishCaseAction: vi.fn(),
  unpublishCaseAction: vi.fn(),
}))

const { ComplaintsSection } = await import('./ComplaintsSection')
const { attachComplaintAction, complaintPublicTextAction } = await import('../publishActions')

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

const attachable = [
  {
    id: 'k2',
    number: 'CP-2027-0004',
    receivedOn: '2027-07-03',
    locationText: '9 Loon Point Road',
    caseNumber: 'EC-2027-0009',
    sameParcel: true,
  },
]

describe('attaching another complaint', () => {
  it('lists the complaints that can be attached and sends the chosen one', async () => {
    vi.mocked(attachComplaintAction).mockResolvedValue({ ok: true, message: 'Attached.' })
    const detail = stubDetail({ attachable })
    renderForm(<ComplaintsSection detail={detail} can={ALL_CAN} />)
    openSection('Attach another complaint')
    const select = screen.getByLabelText(/^Complaint to attach/)
    expect(select.textContent).toContain(
      'CP-2027-0004, received July 3, 2027, 9 Loon Point Road (same parcel)',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Attach complaint' }))
    await vi.waitFor(() => expect(attachComplaintAction).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(attachComplaintAction).mock.calls[0]?.[0]
    expect(sent?.get('complaintId')).toBe('k2')
    expect(sent?.get('caseId')).toBe(detail.staff.row.id)
  })

  it('says so when no complaint can be attached', () => {
    renderForm(<ComplaintsSection detail={stubDetail({ attachable: [] })} can={ALL_CAN} />)
    openSection('Attach another complaint')
    expect(screen.getByText(/No other complaint can be attached right now/)).toBeTruthy()
  })

  it('is not offered on a read-only view', () => {
    renderForm(<ComplaintsSection detail={stubDetail({ attachable })} can={ALL_CAN} readOnly />)
    expect(screen.queryByText('Attach another complaint')).toBeNull()
  })
})
