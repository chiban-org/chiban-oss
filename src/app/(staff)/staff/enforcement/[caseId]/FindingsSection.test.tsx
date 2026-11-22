// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import {
  ALL_CAN,
  fillField,
  labelled,
  openSection,
  renderForm,
  stubDetail,
} from '@/test/enforcementRender'

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
      findingIds: [],
      method: 'first_class_mail',
      sentOn: '2027-07-03',
      receivedOn: null,
      receiptBasis: null,
      documentId: null,
    },
  ],
  cure: { choices: [], rule: null, notices: [] },
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
    fireEvent.click(screen.getByRole('button', { name: 'Record notice of violation' }))
    await expectRefusalBeside(screen.getByRole('checkbox', { name: /Section 4\.2/ }), message)
  })

  it('shows a refused date beside the date field', async () => {
    const message = 'Enter the date sent between January 1, 1900 and July 20, 2027.'
    vi.mocked(sendNoticeAction).mockResolvedValue(refusal('sentOn', message))
    renderForm(<FindingsSection detail={detail} can={ALL_CAN} />)
    openSection('Send a notice of violation')
    fireEvent.click(screen.getByRole('button', { name: 'Record notice of violation' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Date sent')), message)
  })
})

describe('recording a notice of violation', () => {
  it('says Chiban makes the PDF and staff send it', () => {
    renderForm(<FindingsSection detail={detail} can={ALL_CAN} />)
    openSection('Send a notice of violation')
    expect(screen.getByRole('button', { name: 'Record notice of violation' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send notice of violation' })).toBeNull()
    expect(
      screen.getByText('Chiban makes the notice PDF. Send it yourself, then record how it went.'),
    ).toBeTruthy()
  })

  it('fills the recipient from the parcel owner of record', () => {
    const owned = {
      ...detail,
      parcelOwner: { name: 'Wren Ashdown', mailingAddress: '8 Quarry Hill Road, Fernhollow' },
    }
    renderForm(<FindingsSection detail={owned} can={ALL_CAN} />)
    openSection('Send a notice of violation')
    expect(screen.getByLabelText(labelled('Recipient name'))).toHaveProperty(
      'value',
      'Wren Ashdown',
    )
    expect(screen.getByLabelText(labelled('Recipient mailing address'))).toHaveProperty(
      'value',
      '8 Quarry Hill Road, Fernhollow',
    )
    expect(screen.getByLabelText(labelled('Correct the violation by'))).toHaveProperty('value', '')
  })
})

describe('the code in force on a building code finding', () => {
  it('names the edition beside the finding', () => {
    const withEdition = stubDetail({
      findings: [
        {
          id: 'f2',
          provisionKind: 'building_code',
          provisionRef: 'IRC R105.1',
          facts: 'A deck was built with no permit.',
          status: 'open',
          inspectionDate: '2027-07-01',
          foundBy: 'u1',
          editionInForce: 'IRC 2021 (effective 2025-04-07)',
        },
      ],
    })
    renderForm(<FindingsSection detail={withEdition} can={ALL_CAN} />)
    expect(
      screen.getByText('Code in force on the inspection date: IRC 2021 (effective April 7, 2025)'),
    ).toBeTruthy()
  })

  it('names no edition on a zoning finding', () => {
    renderForm(<FindingsSection detail={detail} can={ALL_CAN} />)
    expect(screen.queryByText(/Code in force on the inspection date/)).toBeNull()
  })
})

describe('offering finding and receipt forms only when they apply', () => {
  const summaries = () =>
    screen.queryAllByText(/./, { selector: 'summary' }).map((s) => s.textContent)

  it('offers no finding form at intake, where a finding is refused', () => {
    renderForm(
      <FindingsSection
        detail={stubDetail({
          staff: { ...detail.staff, row: { ...detail.staff.row, status: 'intake' } },
        })}
        can={ALL_CAN}
      />,
    )
    expect(summaries()).not.toContain('Record a finding')
  })

  it('offers no receipt form for a notice whose receipt is recorded', () => {
    const received = { ...detail.notices[0], receivedOn: '2027-07-05', receiptBasis: 'Green card' }
    renderForm(
      <FindingsSection detail={{ ...detail, notices: [received] } as never} can={ALL_CAN} />,
    )
    expect(summaries()).not.toContain('Record receipt')
  })

  it('drops the forms the Do this now card holds', () => {
    renderForm(
      <FindingsSection
        detail={detail}
        can={ALL_CAN}
        hosted={new Set(['record_finding', 'record_notice_receipt:n1', 'send_notice'])}
      />,
    )
    expect(summaries()).toEqual(['More'])
  })
})
