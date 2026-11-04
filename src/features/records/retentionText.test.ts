import { describe, expect, it } from 'vitest'
import { retentionText } from '@/features/records/retentionText'
import type { CivilDate } from '@/types/civilDate'

describe('retentionText', () => {
  it('words each retention state for staff', () => {
    expect(retentionText({ state: 'permanent' })).toBe('Permanent')
    expect(retentionText({ state: 'eligible_on', date: '2028-05-03' as CivilDate })).toBe(
      'Eligible May 3, 2028',
    )
    expect(retentionText({ state: 'not_yet_triggered', awaiting: ['building_removed'] })).toBe(
      'Starts when the building is removed',
    )
    expect(
      retentionText({
        state: 'not_yet_triggered',
        awaiting: ['application_withdrawn', 'application_denied'],
      }),
    ).toBe('Starts when the application is withdrawn or the application is denied')
    expect(
      retentionText({
        state: 'not_yet_triggered',
        awaiting: ['registration_expired', 'septic_replaced_or_removed', 'appeal_period_expired'],
      }),
    ).toBe(
      'Starts when the registration expires or the septic system is replaced or removed or the appeal period ends',
    )
    expect(retentionText(null)).toBe('No record series assigned')
  })
})
