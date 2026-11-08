import { describe, expect, it } from 'vitest'
import { OPEN_FINDING, planFor, planInput, planOrder } from '@/test/casePlan'

const WITHDRAWN = [
  { id: 'f1', status: 'withdrawn' as const },
  { id: 'f2', status: 'withdrawn' as const },
]
const CORRECTED = [
  { id: 'f1', status: 'corrected' as const },
  { id: 'f2', status: 'withdrawn' as const },
]
const SENT = [{ id: 'n1', receivedOn: null }]

describe('the case work plan once findings are withdrawn or corrected', () => {
  it('asks to record no violation when every finding was withdrawn after a notice went out', () => {
    const p = planFor(planInput('violation_found', { findings: WITHDRAWN, notices: SENT }))
    expect(p.sentence).toBe('Waiting on: Town (Sam Clerk). Record no violation.')
    expect(p.now?.action).toEqual({ kind: 'move', to: 'no_violation' })
    expect(p.moves).toEqual(['resolved'])
  })

  it('does not offer no violation while a finding is open', () => {
    const p = planFor(planInput('violation_found', { findings: OPEN_FINDING, notices: SENT }))
    expect(p.moves).not.toContain('no_violation')
  })

  it('asks to resolve the case once the remaining findings are corrected', () => {
    const p = planFor(planInput('violation_found', { findings: CORRECTED, notices: SENT }))
    expect(p.sentence).toBe('Waiting on: Town (Sam Clerk). Resolve the case.')
    expect(p.now?.action).toEqual({ kind: 'move', to: 'resolved' })
  })

  it('asks to resolve the case when its only order was complied with', () => {
    const complied = planOrder({}, { status: 'complied' })
    const p = planFor(planInput('order_issued', { findings: CORRECTED, orders: [complied] }))
    expect(p.sentence).toBe('Waiting on: Town (Sam Clerk). Resolve the case.')
    expect(p.due).toBeNull()
  })

  it('asks to resolve an ordered case whose findings were all withdrawn', () => {
    const p = planFor(planInput('order_issued', { findings: WITHDRAWN, orders: [planOrder()] }))
    expect(p.now?.action).toEqual({ kind: 'move', to: 'resolved' })
  })

  it('counts only findings that still stand as recorded', () => {
    const p = planFor(planInput('investigating', { findings: WITHDRAWN }))
    expect(p.groups[0]?.rows.map((r) => [r.label, r.done])).toEqual([['Finding recorded', false]])
  })
})

describe('the case work plan around judgments and stale drafts', () => {
  it('still collects an owed fine after a judgment when every finding is withdrawn', () => {
    const judged = planOrder(
      { steps: [{ kind: 'judgment', occurredOn: '2026-10-30', judgmentOutcome: 'affirmed' }] },
      { status: 'judgment' },
    )
    const p = planFor(
      planInput('in_court', {
        findings: WITHDRAWN,
        orders: [judged],
        fines: [{ row: { id: 'fine1' }, dueCents: 25000 }],
      }),
    )
    expect(p.now?.action).toEqual({ kind: 'record_fine_payment', fineId: 'fine1' })
  })

  it('asks for a new draft when the draft includes a withdrawn finding', () => {
    const draft = planOrder({}, { status: 'draft', issuedOn: null, findingIds: ['f1', 'f3'] })
    const p = planFor(
      planInput('violation_found', {
        findings: [
          { id: 'f1', status: 'withdrawn' },
          { id: 'f3', status: 'open' },
        ],
        notices: SENT,
        orders: [draft],
      }),
    )
    expect(p.now?.key).toBe('order.redraft')
    expect(p.now?.task).toBe('Discard draft order CD-2026-0001 and draft a new one')
    expect(p.now?.action).toBeNull()
  })
})
