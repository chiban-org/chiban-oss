import { ME_PACK } from '@packs/me'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setActivePackForTest } from '@/features/packs/registry'
import { recordsRequest } from '@/features/packs/vocabulary'
import { dueThisWeekLabel, overdueRequestsLabel } from '@/features/staffHome/recordsHome'

beforeAll(() => {
  setActivePackForTest(ME_PACK)
})
afterAll(() => {
  setActivePackForTest(null)
})

describe('records rows on Today', () => {
  it('reads singular at a count of one', () => {
    expect(overdueRequestsLabel(1)).toBe(`${recordsRequest()} past its response day`)
    expect(dueThisWeekLabel(1)).toBe(`${recordsRequest()} due this week`)
  })

  it('reads plural at any other count and with no count', () => {
    for (const count of [0, 2, undefined]) {
      expect(overdueRequestsLabel(count)).toBe(`${recordsRequest()}s past their response day`)
      expect(dueThisWeekLabel(count)).toBe(`${recordsRequest()}s due this week`)
    }
  })
})
