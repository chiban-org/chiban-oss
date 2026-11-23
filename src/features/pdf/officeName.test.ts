import { describe, expect, it } from 'vitest'
import { officeNameOf } from '@/features/pdf/officeName'
import { TOWN_PROFILE_SKELETON } from '@/features/town/profileSchema'

describe('the office name staff and residents see', () => {
  it('reads the town profile office name', () => {
    expect(officeNameOf({ ...TOWN_PROFILE_SKELETON, officeName: 'Fernhollow Code Office' })).toBe(
      'Fernhollow Code Office',
    )
  })

  it('falls back to the land use office without a profile', () => {
    expect(officeNameOf(null)).toBe('land use office')
  })
})
