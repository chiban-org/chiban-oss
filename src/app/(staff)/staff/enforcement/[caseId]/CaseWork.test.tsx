// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { CaseWorkPlan } from '@/features/enforcement/workPlanTypes'
import { stubDetail } from '@/test/enforcementRender'

vi.mock('../findingActions', () => ({
  addNoteAction: vi.fn(),
  recordFindingAction: vi.fn(),
  recordNoticeReceiptAction: vi.fn(),
  sendNoticeAction: vi.fn(),
}))
vi.mock('../orderActions', () => ({
  discardDraftOrderAction: vi.fn(),
  draftOrderAction: vi.fn(),
  issueOrderAction: vi.fn(),
  reviseDraftOrderAction: vi.fn(),
}))
vi.mock('../serviceActions', () => ({
  answerAction: vi.fn(),
  courtStepAction: vi.fn(),
  listRecipientAction: vi.fn(),
  roleCheckAction: vi.fn(),
  serviceEventAction: vi.fn(),
}))
vi.mock('../moneyActions', () => ({
  fineAction: vi.fn(),
  finePaymentAction: vi.fn(),
  outcomeAction: vi.fn(),
  referAction: vi.fn(),
}))
vi.mock('../actions', () => ({ setCaseStatusAction: vi.fn() }))

const { CaseDoThisNow } = await import('./CaseWork')

afterEach(cleanup)

const detail = stubDetail({
  orders: [
    {
      row: { id: 'o1' },
      service: {
        recipients: [
          { id: 'r1', name: 'Pat Owner', role: 'record_owner' },
          { id: 'r2', name: 'Robin Renter', role: 'occupying_tenant' },
        ],
      },
    },
  ],
})

function planWith(now: Partial<NonNullable<CaseWorkPlan['now']>>): CaseWorkPlan {
  return {
    status: 'order_issued',
    stayed: false,
    sentence: '',
    due: null,
    groups: [],
    moves: [],
    now: {
      key: 'step',
      task: 'Task',
      ask: 'Task',
      actor: 'town',
      actorName: null,
      note: null,
      action: null,
      warnings: [],
      ...now,
    },
  }
}

const select = (label: string) => screen.getByLabelText<HTMLSelectElement>(label)

describe('the case Do this now card', () => {
  it('chooses posting or publication when the step names no recipient', () => {
    render(
      <CsrfProvider token="t">
        <CaseDoThisNow
          detail={detail}
          plan={planWith({
            action: { kind: 'record_service', orderId: 'o1', recipientId: null },
          })}
        />
      </CsrfProvider>,
    )
    expect(select('Recipient').value).toBe('')
  })

  it('resets the chosen role when the next step checks another role', () => {
    const ui = (role: 'taxpayer' | 'occupying_tenant') => (
      <CsrfProvider token="t">
        <CaseDoThisNow
          detail={detail}
          plan={planWith({ action: { kind: 'record_role_check', orderId: 'o1', role } })}
        />
      </CsrfProvider>
    )
    const { rerender } = render(ui('taxpayer'))
    expect(select('Role').value).toBe('taxpayer')
    rerender(ui('occupying_tenant'))
    expect(select('Role').value).toBe('occupying_tenant')
  })
})
