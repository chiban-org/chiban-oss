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

vi.mock('../orderActions', () => ({
  discardDraftOrderAction: vi.fn(),
  draftOrderAction: vi.fn(),
  issueOrderAction: vi.fn(),
  reviseDraftOrderAction: vi.fn(),
}))

const { OrdersSection } = await import('./OrdersSection')
const { draftOrderAction, issueOrderAction, reviseDraftOrderAction } = await import(
  '../orderActions'
)

afterEach(cleanup)

const finding = {
  id: 'f1',
  provisionKind: 'zoning_ordinance',
  provisionRef: 'Section 4.2',
  status: 'open',
}

const draft = {
  row: {
    id: 'o1',
    number: 'CD-2027-0001',
    findingIds: [],
    status: 'draft',
    rowVersion: 1,
    correctiveAction: '',
    correctiveDeadline: null,
    ceaseImmediately: false,
    issuedOn: null,
    issuedBy: null,
    documentId: null,
  },
  rule: { label: 'Cease and desist', citation: { label: 'RSA 676:17', url: null } },
}

describe('drafting an order', () => {
  it('shows refused findings beside the findings group', async () => {
    const message = 'Choose at least one finding.'
    vi.mocked(draftOrderAction).mockResolvedValue(refusal('findingIds', message))
    renderForm(<OrdersSection detail={stubDetail({ findings: [finding] })} can={ALL_CAN} />)
    openSection('Draft an order')
    fillField(labelled('Corrective action due'), '2027-09-01')
    fireEvent.click(screen.getByRole('button', { name: 'Draft order' }))
    await expectRefusalBeside(screen.getByLabelText(/Section 4\.2/), message)
  })

  it('shows a refused deadline beside the deadline field', async () => {
    const message = 'Enter the corrective action deadline as a date.'
    vi.mocked(draftOrderAction).mockResolvedValue(refusal('correctiveDeadline', message))
    renderForm(<OrdersSection detail={stubDetail({ findings: [finding] })} can={ALL_CAN} />)
    openSection('Draft an order')
    fillField(labelled('Corrective action due'), '2027-09-01')
    fireEvent.click(screen.getByRole('button', { name: 'Draft order' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Corrective action due')), message)
  })
})

describe('revising a draft order', () => {
  it('shows a refused action text beside the corrective action field', async () => {
    const message = 'Enter the corrective action of 5000 characters or fewer.'
    vi.mocked(reviseDraftOrderAction).mockResolvedValue(refusal('correctiveAction', message))
    renderForm(<OrdersSection detail={stubDetail({ orders: [draft] })} can={ALL_CAN} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save the draft' }))
    await expectRefusalBeside(
      screen.getAllByLabelText(labelled('Corrective action required'))[0] as HTMLElement,
      message,
    )
  })
})

describe('issuing an order', () => {
  it('shows a refused issue date beside the issue date field', async () => {
    const message =
      'You are not on record as a designated enforcement officer on the issue date. An administrator can add it under Admin, Enforcement officers.'
    vi.mocked(issueOrderAction).mockResolvedValue(refusal('issuedOn', message))
    renderForm(<OrdersSection detail={stubDetail({ orders: [draft] })} can={ALL_CAN} />)
    fireEvent.click(screen.getByRole('button', { name: 'Issue order' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Issue date')), message)
  })
})

describe('a draft whose finding was withdrawn', () => {
  it('says it needs a new draft and offers no issue form', () => {
    const stale = { ...draft, row: { ...draft.row, findingIds: ['f1'] } }
    renderForm(
      <OrdersSection
        detail={stubDetail({ findings: [{ ...finding, status: 'withdrawn' }], orders: [stale] })}
        can={ALL_CAN}
      />,
    )
    expect(screen.getByText(/This draft includes a finding that was withdrawn/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Issue order' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Discard the draft' })).toBeTruthy()
  })
})
