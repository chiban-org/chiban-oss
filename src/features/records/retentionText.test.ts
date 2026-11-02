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
      'Waiting for: building removed',
    )
    expect(
      retentionText({
        state: 'not_yet_triggered',
        awaiting: ['application_withdrawn', 'application_denied'],
      }),
    ).toBe('Waiting for: application withdrawn or application denied')
    expect(retentionText(null)).toBe('No record series assigned')
  })
})
