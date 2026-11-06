// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { expectRefusalBeside } from '@/test/besideField'
import {
  ALL_CAN,
  fillField,
  labelled,
  openSection,
  renderForm,
  stubDetail,
} from '@/test/enforcementRender'
import { refusal } from '@/test/refusalBeside'

vi.mock('../findingActions', () => ({
  addNoteAction: vi.fn(),
  recordFindingAction: vi.fn(),
  recordNoticeReceiptAction: vi.fn(),
  sendNoticeAction: vi.fn(),
}))

const { FindingsSection, NotesSection } = await import('./FindingsSection')
const { addNoteAction, recordFindingAction, recordNoticeReceiptAction, sendNoticeAction } =
  await import('../findingActions')

afterEach(cleanup)

const detail = stubDetail({
  findings: [
    {
      id: 'f1',
      provisionKind: 'zoning_ordinance',
      provisionRef: 'Section 4.2',
      facts: 'A shed.',
      status: 'open',
      inspectionDate: '2027-07-01',
      foundBy: 'u1',
    },
  ],
  notices: [
    {
      id: 'n1',
      method: 'first_class_mail',
      sentOn: '2027-07-03',
      receivedOn: null,
      receiptBasis: null,
      documentId: null,
    },
  ],
})

describe('adding a note', () => {
  it('shows a refused date beside the date field', async () => {
    const message = 'Enter the date observed between January 1, 1900 and July 20, 2027.'
    vi.mocked(addNoteAction).mockResolvedValue(refusal('observedOn', message))
    renderForm(<NotesSection detail={detail} can={ALL_CAN} />)
    openSection('Add a note')
    fillField(labelled('Note'), 'Seen')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Date observed')), message)
  })

  it('shows a refused note beside the note field', async () => {
    const message = 'Enter a note of 5000 characters or fewer.'
    vi.mocked(addNoteAction).mockResolvedValue(refusal('body', message))
    renderForm(<NotesSection detail={detail} can={ALL_CAN} />)
    openSection('Add a note')
    fillField(labelled('Note'), 'Seen')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Note')), message)
  })
})

describe('recording a finding', () => {
  it('shows a refused section beside the section field', async () => {
    const message = 'Enter the section or condition of 300 characters or fewer.'
    vi.mocked(recordFindingAction).mockResolvedValue(refusal('provisionRef', message))
    renderForm(<FindingsSection detail={detail} can={ALL_CAN} />)
    openSection('Record a finding')
    fillField(labelled('Section or condition'), 'x')
    fillField(labelled('Facts'), 'y')
    fireEvent.click(screen.getByRole('button', { name: 'Record finding' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Section or condition')), message)
  })
})

describe('recording receipt of a notice', () => {
  it('shows a refused basis beside the basis field', async () => {
    const message = 'Enter how receipt is known of 500 characters or fewer.'
    vi.mocked(recordNoticeReceiptAction).mockResolvedValue(refusal('basis', message))
    renderForm(<FindingsSection detail={detail} can={ALL_CAN} />)
    openSection('Record receipt')
    fillField(labelled('How receipt is known'), 'x')
    fireEvent.click(screen.getByRole('button', { name: 'Record receipt' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('How receipt is known')), message)
  })
})

describe('sending a notice of violation', () => {
  it('shows a refused findings choice beside the findings group', async () => {
    const message = 'Choose at least one finding.'
    vi.mocked(sendNoticeAction).mockResolvedValue(refusal('findingIds', message))
    renderForm(<FindingsSection detail={detail} can={ALL_CAN} />)
    openSection('Send a notice of violation')
    fireEvent.click(screen.getByRole('button', { name: 'Send notice of violation' }))
    await expectRefusalBeside(screen.getByLabelText(/Section 4\.2/), message)
  })

  it('shows a refused date beside the date field', async () => {
    const message = 'Enter the date sent between January 1, 1900 and July 20, 2027.'
    vi.mocked(sendNoticeAction).mockResolvedValue(refusal('sentOn', message))
    renderForm(<FindingsSection detail={detail} can={ALL_CAN} />)
    openSection('Send a notice of violation')
    fireEvent.click(screen.getByRole('button', { name: 'Send notice of violation' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Date sent')), message)
  })
})
