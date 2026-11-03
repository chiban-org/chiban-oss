import { describe, expect, it } from 'vitest'
import {
  ALL_BUT_DRAFT_STATES,
  NEEDS_ACTION_STATES,
  statesForParam,
} from '@/features/queue/stateScopes'

describe('queue state scopes', () => {
  it('needs action leaves out drafts and finished applications but keeps issued permits', () => {
    for (const state of ['draft', 'closed', 'denied', 'withdrawn', 'expired'] as const) {
      expect(NEEDS_ACTION_STATES).not.toContain(state)
    }
    expect(NEEDS_ACTION_STATES).toEqual(
      expect.arrayContaining(['submitted', 'under_review', 'decided', 'issued', 'suspended']),
    )
  })

  it('all but draft keeps the finished applications', () => {
    expect(ALL_BUT_DRAFT_STATES).not.toContain('draft')
    expect(ALL_BUT_DRAFT_STATES).toEqual(expect.arrayContaining(['closed', 'denied', 'expired']))
  })

  it('maps the status parameter to the states to list', () => {
    expect(statesForParam(undefined)).toBeUndefined()
    expect(statesForParam('')).toBeUndefined()
    expect(statesForParam('all')).toEqual(ALL_BUT_DRAFT_STATES)
    expect(statesForParam('denied')).toEqual(['denied'])
    expect(statesForParam('bogus')).toBeUndefined()
  })
})
