import { describe, expect, it } from 'vitest'
import { eventMovesClocks, keysCancelledBy } from '@/features/clocks/ruleEngine'
import { clockRule } from '@/features/packs/probes/probe'
import { ClockRuleSchema, type PackRule } from '@/features/packs/schema'

const BASE = { classification: null, dwellingUnits: null, afterTheFact: false } as const
const GRANTED_ONLY = {
  event: 'rehearing_vote',
  onlyWhen: { fact: 'outcome', in: ['rehearing_granted'] },
} as const

function withCancel(cancelledBy: unknown): PackRule {
  return { ...clockRule('nh.bp.decision'), cancelledBy } as PackRule
}

describe('a clock cancelled by an event', () => {
  it('accepts a start event or an event with facts', () => {
    const rule = clockRule('nh.bp.decision')
    expect(ClockRuleSchema.safeParse({ ...rule, cancelledBy: 'hearing_held' }).success).toBe(true)
    expect(ClockRuleSchema.safeParse({ ...rule, cancelledBy: GRANTED_ONLY }).success).toBe(true)
    expect(
      ClockRuleSchema.safeParse({ ...rule, cancelledBy: { event: 'rehearing_vote' } }).success,
    ).toBe(false)
    expect(
      ClockRuleSchema.safeParse({ ...rule, cancelledBy: { event: 'nope', onlyWhen: [] } }).success,
    ).toBe(false)
  })

  it('cancels on the event only when its facts match', () => {
    const rules = [withCancel(GRANTED_ONLY)]
    expect(eventMovesClocks(rules, 'rehearing_vote')).toBe(true)
    expect(
      keysCancelledBy(rules, 'rehearing_vote', { ...BASE, outcome: 'rehearing_granted' }),
    ).toEqual(['nh.bp.decision'])
    expect(
      keysCancelledBy(rules, 'rehearing_vote', { ...BASE, outcome: 'rehearing_denied' }),
    ).toEqual([])
    expect(keysCancelledBy(rules, 'rehearing_vote')).toEqual([])
    expect(
      keysCancelledBy(rules, 'hearing_held', { ...BASE, outcome: 'rehearing_granted' }),
    ).toEqual([])
  })

  it('still cancels on a plain start event whatever the facts', () => {
    const rules = [withCancel('hearing_held')]
    expect(keysCancelledBy(rules, 'hearing_held')).toEqual(['nh.bp.decision'])
    expect(keysCancelledBy(rules, 'hearing_held', { ...BASE, outcome: 'denied' })).toEqual([
      'nh.bp.decision',
    ])
  })
})
