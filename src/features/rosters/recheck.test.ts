import { describe, expect, it } from 'vitest'
import { isDue, lastChecked } from '@/features/rosters/recheck'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

describe('lastChecked', () => {
  it('takes the later of the roster date and the last confirmation', () => {
    expect(lastChecked('2026-01-10', '2026-06-01')).toBe('2026-06-01')
    expect(lastChecked('2026-06-01', '2026-01-10')).toBe('2026-06-01')
    expect(lastChecked('2026-06-01', null)).toBe('2026-06-01')
    expect(lastChecked(null, null)).toBeNull()
  })
})

describe('isDue', () => {
  it('is due only once more days than the interval have passed', () => {
    expect(isDue(d('2025-11-04'), d('2026-11-04'), 365)).toBe(false)
    expect(isDue(d('2025-11-03'), d('2026-11-04'), 365)).toBe(true)
  })

  it('treats an entry never checked as due', () => {
    expect(isDue(null, d('2026-11-04'), 365)).toBe(true)
  })
})
