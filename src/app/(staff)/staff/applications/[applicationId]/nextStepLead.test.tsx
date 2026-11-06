import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { type PlanView, planWork } from '@/features/applications/workPlan'
import type { PlanFormInput } from './planActionForm'

vi.mock('./actions', () => ({ transitionAction: vi.fn(), setSubstepAction: vi.fn() }))
vi.mock('./buildingActions', () => ({}))
vi.mock('./clockFeeActions', () => ({}))
vi.mock('../../boards/actions', () => ({}))
vi.mock('../../reviews/actions', () => ({}))
vi.mock('@/app/(staff)/staff/payments/actions', () => ({}))

const { DoThisNow } = await import('./doThisNow')

const ISSUED = {
  id: 'a1',
  number: 'BP-2025-0001',
  rowVersion: 3,
  state: 'issued',
  classification: 'nh.building_permit',
  completedDate: '2025-04-01',
  nextTransitions: ['closed', 'expired'],
  allowedMoves: ['closed', 'expired'],
  gates: [{ to: 'closed', results: [] }],
  gatesAhead: [],
  allowsDirectIssue: false,
  clocks: [],
  regionalImpact: { applies: false, determination: null, notices: [] },
}

function card(allowed: string[]): string {
  const view = { ...ISSUED, allowedMoves: allowed } as unknown as PlanView & StaffApplicationView
  const plan = planWork(view, null, { reviewers: 0, abilities: new Set(), responsible: null })
  const input = { view, records: {}, payments: null, board: null } as unknown as PlanFormInput
  return renderToStaticMarkup(<DoThisNow plan={plan} input={input} />)
}

describe('the card when nothing blocks closing', () => {
  it('names closing as the task and holds it as a destructive button, not the filled one', () => {
    const html = card(['closed', 'expired'])
    expect(html).toContain('Close the permit')
    expect(html).toMatch(/data-variant="destructive"[^>]*>Close the permit</)
    expect(html).not.toContain('data-variant="default"')
  })

  it('says the role cannot make the move when it is not allowed', () => {
    const html = card(['expired'])
    expect(html).toContain('Close the permit')
    expect(html).toContain('Your role cannot make this move.')
    expect(html).not.toContain('<button')
  })
})
