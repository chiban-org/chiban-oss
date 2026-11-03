import { describe, expect, it } from 'vitest'
import type { GateResult } from '@/features/gates/evaluateGates'
import { gateAnchor, planNextStep } from './nextStep'
import type { CoreState } from './states'

function gate(key: string, blocked: boolean, reason = 'Not yet.'): GateResult {
  return {
    key,
    label: key,
    citation: null,
    kind: 'administrative',
    outcome: blocked ? { status: 'blocked', reason } : { status: 'pass' },
    override: null,
    effective: blocked ? 'blocked' : 'pass',
  }
}

function plan(
  transitions: CoreState[],
  gates: Partial<Record<CoreState, GateResult[]>> = {},
  allowed: CoreState[] = transitions,
) {
  return planNextStep(
    transitions,
    transitions.map((to) => ({ to, results: gates[to] ?? [] })),
    allowed,
  )
}

describe('next step plan', () => {
  it('makes the leading move primary when its gates are clear', () => {
    const p = plan(['issued', 'expired', 'withdrawn'])
    expect(p.lead).toEqual({ to: 'issued', blockers: [] })
    expect(p.primary).toBe('issued')
    expect(p.terminal).toEqual(['expired', 'withdrawn'])
  })

  it('lists the blockers of the leading move and offers no primary while it is blocked', () => {
    const p = plan(['issued', 'expired', 'withdrawn'], {
      issued: [gate('fees.paid', true, 'Fees due: $50.00.'), gate('other', false)],
    })
    expect(p.primary).toBeNull()
    expect(p.lead?.blockers).toEqual([
      {
        key: 'fees.paid',
        label: 'fees.paid',
        reason: 'Fees due: $50.00.',
        anchor: 'fees-and-payments',
      },
    ])
  })

  it('never makes a terminal move primary, even when it is the only move', () => {
    const p = plan(['closed', 'expired'])
    expect(p.primary).toBeNull()
    expect(p.lead).toEqual({ to: 'closed', blockers: [] })
    expect(p.terminal).toEqual(['closed', 'expired'])
    expect(plan(['withdrawn']).primary).toBeNull()
    expect(plan(['denied', 'withdrawn']).lead).toBeNull()
  })

  it('offers other forward moves as secondary only when their gates are clear', () => {
    const clear = plan(['under_review', 'issued', 'denied', 'withdrawn'])
    expect(clear.primary).toBe('under_review')
    expect(clear.secondary).toEqual(['issued'])
    const blocked = plan(['under_review', 'issued', 'denied', 'withdrawn'], {
      issued: [gate('fees.paid', true)],
    })
    expect(blocked.secondary).toEqual([])
    expect(blocked.terminal).toEqual(['denied', 'withdrawn'])
  })

  it('an overridden gate no longer blocks', () => {
    const overridden = { ...gate('fees.paid', true), effective: 'pass' as const }
    expect(plan(['issued'], { issued: [overridden] }).primary).toBe('issued')
  })

  it('drops a gate label repeated at the start of its reason', () => {
    const repeated = gate(
      'nh.appeal.suspension',
      true,
      'Suspended by appeal (RSA 676:6). Resolve the appeal first.',
    )
    const labelled = { ...repeated, label: 'Suspended by appeal (RSA 676:6)' }
    expect(plan(['closed'], { closed: [labelled] }).lead?.blockers[0]?.reason).toBe(
      'Resolve the appeal first.',
    )
  })

  it('plans the lead and its blockers from every move, even one this viewer may not make', () => {
    const p = plan(
      ['decided', 'withdrawn'],
      { decided: [gate('reviews.signed_off', true, 'No reviewer is assigned.')] },
      ['withdrawn'],
    )
    expect(p.lead?.to).toBe('decided')
    expect(p.lead?.blockers.map((b) => b.anchor)).toEqual(['reviewers'])
    expect(p.leadAllowed).toBe(false)
    expect(p.terminal).toEqual(['withdrawn'])
  })

  it('offers only the moves this viewer may make', () => {
    const p = plan(['under_review', 'issued', 'closed', 'withdrawn'], {}, ['withdrawn'])
    expect(p.lead?.to).toBe('under_review')
    expect(p.primary).toBeNull()
    expect(p.secondary).toEqual([])
    expect(p.terminal).toEqual(['withdrawn'])
    const own = plan(['closed'], {}, [])
    expect(own.lead?.to).toBe('closed')
    expect(own.leadAllowed).toBe(false)
    expect(own.terminal).toEqual([])
  })

  it('links each gate to the panel that clears it', () => {
    expect(gateAnchor('conditions.blocking_met')).toBe('conditions')
    expect(gateAnchor('closure.requirement_met')).toBe('inspections')
    expect(gateAnchor('reviews.signed_off')).toBe('reviewers')
    expect(gateAnchor('nh.bp.code_edition_recorded')).toBe('code-edition')
    expect(gateAnchor('nh.bp.regional_impact')).toBe('regional-impact')
    expect(gateAnchor('nh.appeal.suspension')).toBe('appeals')
    expect(gateAnchor('something.new')).toBe('gates')
  })
})
