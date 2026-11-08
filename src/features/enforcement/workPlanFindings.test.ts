import { describe, expect, it } from 'vitest'
import { OPEN_FINDING, planFor, planInput, planOrder } from '@/test/casePlan'

const WITHDRAWN = [{ status: 'withdrawn' as const }, { status: 'withdrawn' as const }]
const CORRECTED = [{ status: 'corrected' as const }, { status: 'withdrawn' as const }]
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
