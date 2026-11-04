import { describe, expect, it } from 'vitest'
import { CORE_STATES } from '@/features/applications/states'
import { readTableParams } from '@/features/dataTable/params'
import {
  NEEDS_ACTION_STATES,
  readStatusTab,
  STATUS_TAB_STATES,
  STATUS_TABS,
  statesForTab,
  tabForState,
} from '@/features/queue/stateScopes'

describe('application status tabs', () => {
  it('needs action takes only submitted and under review work by state', () => {
    expect(NEEDS_ACTION_STATES).toEqual(['submitted', 'under_review'])
  })

  it('offers needs action first and all last', () => {
    expect(STATUS_TABS).toEqual(['action', 'open', 'issued', 'finished', 'all'])
  })

  it('keeps drafts in open and in all, and nowhere else', () => {
    expect(statesForTab('open')).toEqual(['draft', 'submitted', 'under_review', 'decided'])
    expect(statesForTab('issued')).toEqual(['issued', 'suspended'])
    expect(statesForTab('finished')).toEqual(['closed', 'denied', 'withdrawn', 'expired'])
    expect(statesForTab('all')).toEqual([...CORE_STATES])
    expect(statesForTab('action')).toBeUndefined()
  })

  it('puts every core state in exactly one of the three state groups', () => {
    const grouped = (['open', 'issued', 'finished'] as const).flatMap(
      (tab) => STATUS_TAB_STATES.get(tab) ?? [],
    )
    expect([...grouped].sort()).toEqual([...CORE_STATES].sort())
  })

  it('reads the tab from the stage param and falls back to needs action', () => {
    expect(readStatusTab(readTableParams({}))).toBe('action')
    expect(readStatusTab(readTableParams({ stage: 'issued' }))).toBe('issued')
    expect(readStatusTab(readTableParams({ stage: 'bogus' }))).toBe('action')
  })

  it('maps an old queue state param to the tab that holds it', () => {
    expect(tabForState(undefined)).toBe('action')
    expect(tabForState('all')).toBe('all')
    expect(tabForState('draft')).toBe('open')
    expect(tabForState('submitted')).toBe('open')
    expect(tabForState('suspended')).toBe('issued')
    expect(tabForState('denied')).toBe('finished')
    expect(tabForState('bogus')).toBe('action')
  })
})
