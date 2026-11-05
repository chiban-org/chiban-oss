import { describe, expect, it } from 'vitest'
import { landRecordsText } from '@/features/rosters/rosterView'
import type { CivilDate } from '@/types/civilDate'

describe('landRecordsText', () => {
  it('names the day the land records were last checked', () => {
    expect(
      landRecordsText({ state: 'reviewed', reviewedOn: '2026-11-04' as CivilDate, ageDays: 3 }),
    ).toBe('Land records checked for new restrictions on November 4, 2026')
  })

  it('says when the land records have never been checked', () => {
    expect(landRecordsText({ state: 'never_reviewed', reviewedOn: null, ageDays: null })).toBe(
      'Land records not yet checked for restrictions',
    )
  })
})
