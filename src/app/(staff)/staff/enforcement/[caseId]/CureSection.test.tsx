// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { ALL_CAN, labelled, openSection, renderForm, stubDetail } from '@/test/enforcementRender'

vi.mock('../cureActions', () => ({
  applyCureProcedureAction: vi.fn(),
  recordCureReceiptAction: vi.fn(),
  sendCureNoticeAction: vi.fn(),
}))

const { CureSection, SendCureNoticeForm } = await import('./CureSection')

afterEach(cleanup)

const RULE = {
  key: 'xx.enf.cure_notice',
  label: 'Cure procedure',
  method: 'certified_mail_return_receipt',
}

const FINDING = {
  id: 'f1',
  status: 'open',
  provisionKind: 'zoning_ordinance',
  provisionRef: 'Zoning Ordinance Section 4.1',
  facts: 'Trees were cut inside the shoreland strip.',
  inspectionDate: '2027-07-10',
}

function cureDetail(overrides: Record<string, unknown> = {}): CaseDetail {
  return stubDetail({
    findings: [FINDING],
    parcelOwner: { name: 'Larkspur Family Trust', mailingAddress: '9 Fern Road, Vellmora' },
    cure: { choices: [{ key: RULE.key, label: RULE.label }], rule: RULE, notices: [] },
    ...overrides,
  })
}

function staffRow(status: string) {
  return {
    row: {
      id: 'c1',
      rowVersion: 3,
      status,
      parcelId: 'p1',
      isPublic: false,
      publicSummary: null,
    },
    notes: [],
    complaints: [],
  }
}

describe('the cure notice form', () => {
  it('fills the owner from the parcel and keeps the fields editable', () => {
    renderForm(<SendCureNoticeForm detail={cureDetail()} variant="outline" />)
    const name = screen.getByLabelText<HTMLInputElement>(labelled('Owner name'))
    const address = screen.getByLabelText<HTMLInputElement>(labelled('Owner mailing address'))
    expect(name.value).toBe('Larkspur Family Trust')
    expect(address.value).toBe('9 Fern Road, Vellmora')
    expect(name.readOnly).toBe(false)
    expect(address.readOnly).toBe(false)
  })

  it('leaves the owner blank when the case has no parcel owner', () => {
    renderForm(<SendCureNoticeForm detail={cureDetail({ parcelOwner: null })} variant="outline" />)
    expect(screen.getByLabelText<HTMLInputElement>(labelled('Owner name')).value).toBe('')
    expect(screen.getByLabelText<HTMLInputElement>(labelled('Owner mailing address')).value).toBe(
      '',
    )
  })
})

describe('the cure section on a case', () => {
  const sent = {
    id: 'n1',
    recipientRole: 'owner',
    recipientName: 'Larkspur Family Trust',
    mailingAddress: '9 Fern Road, Vellmora',
    sentOn: '2027-07-01',
    due: '2027-07-11',
    returnReceiptOn: null,
    documentId: 'doc1',
    findingIds: ['f9'],
  }

  it('links each sent notice to its letter', () => {
    const detail = cureDetail({
      staff: staffRow('violation_found'),
      cure: { choices: [], rule: RULE, notices: [sent] },
    })
    renderForm(<CureSection detail={detail} can={ALL_CAN} hosted={new Set()} />)
    expect(screen.getByRole('link', { name: 'Open notice' }).getAttribute('href')).toBe(
      '/api/documents/doc1',
    )
  })

  it('offers the procedure and notice forms on an open case', () => {
    const detail = cureDetail({ staff: staffRow('violation_found') })
    renderForm(<CureSection detail={detail} can={ALL_CAN} hosted={new Set()} />)
    openSection('Send a cure notice')
    expect(screen.getByText('Choose the procedure', { selector: 'summary' })).not.toBeNull()
  })

  it('hides every control on a closed case', () => {
    const closed = cureDetail({ staff: staffRow('closed') })
    renderForm(<CureSection detail={closed} can={ALL_CAN} hosted={new Set()} />)
    expect(screen.queryByText('Choose the procedure', { selector: 'summary' })).toBeNull()
    expect(screen.queryByText('Send a cure notice', { selector: 'summary' })).toBeNull()
    cleanup()
    const closedSent = cureDetail({
      staff: staffRow('closed'),
      cure: { choices: [], rule: RULE, notices: [sent] },
    })
    renderForm(<CureSection detail={closedSent} can={ALL_CAN} hosted={new Set()} />)
    expect(screen.queryByText('Record return receipt', { selector: 'summary' })).toBeNull()
  })
})
