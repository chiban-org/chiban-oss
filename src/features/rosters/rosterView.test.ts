import { describe, expect, it } from 'vitest'
import type { RosterStatus } from '@/features/rosters/reviews'
import { rosterStatusText } from '@/features/rosters/rosterView'
import type { CivilDate } from '@/types/civilDate'

const reviewed = (ageDays: number): RosterStatus => ({
  state: 'reviewed',
  reviewedOn: '2026-11-04' as CivilDate,
  ageDays,
})

describe('rosterStatusText', () => {
  it('says today rather than a zero count', () => {
    expect(rosterStatusText(reviewed(0))).toBe('Reviewed November 4, 2026, today')
  })

  it('counts days once at least one has passed', () => {
    expect(rosterStatusText(reviewed(1))).toBe('Reviewed November 4, 2026, 1 day ago')
    expect(rosterStatusText(reviewed(12))).toBe('Reviewed November 4, 2026, 12 days ago')
  })

  it('says when a roster has never been reviewed', () => {
    expect(rosterStatusText({ state: 'never_reviewed', reviewedOn: null, ageDays: null })).toBe(
      'Never reviewed',
    )
  })
})
