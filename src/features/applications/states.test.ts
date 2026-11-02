import { describe, expect, it } from 'vitest'
import {
  CORE_STATES,
  CORE_TRANSITIONS,
  isTransitionAllowed,
  STATE_LABELS,
  TERMINAL_STATES,
} from '@/features/applications/states'

describe('core states', () => {
  it('transitions table has no path out of a terminal state', () => {
    for (const s of TERMINAL_STATES) expect(CORE_TRANSITIONS[s]).toEqual([])
  })

  it('every state has a transition entry and a label, and targets are core states', () => {
    for (const s of CORE_STATES) {
      expect(CORE_TRANSITIONS[s]).toBeDefined()
      expect(STATE_LABELS[s].length).toBeGreaterThan(0)
      for (const t of CORE_TRANSITIONS[s]) expect(CORE_STATES).toContain(t)
    }
  })

  it('draft is never a target', () => {
    for (const s of CORE_STATES) expect(CORE_TRANSITIONS[s]).not.toContain('draft')
  })

  it('submitted to issued needs the direct-issue workflow flag', () => {
    expect(isTransitionAllowed('submitted', 'issued', { allowsDirectIssue: false })).toBe(false)
    expect(isTransitionAllowed('submitted', 'issued', { allowsDirectIssue: true })).toBe(true)
    expect(isTransitionAllowed('under_review', 'decided', { allowsDirectIssue: false })).toBe(true)
  })

  it('issued can be suspended and a suspended permit can return to issued or close', () => {
    expect(CORE_TRANSITIONS.issued).toEqual(['closed', 'expired', 'suspended'])
    expect(CORE_TRANSITIONS.suspended).toEqual(['issued', 'closed'])
  })
})
