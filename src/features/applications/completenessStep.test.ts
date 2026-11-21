import { ME_PACK } from '@packs/me'
import { afterEach, describe, expect, it } from 'vitest'
import { completenessStepFor, offersCompleteness } from '@/features/applications/completenessStep'
import { loadPack } from '@/features/packs/loadPack'
import { setActivePackForTest } from '@/features/packs/registry'

afterEach(() => setActivePackForTest(null))

function offering(): string[] {
  return loadPack()
    .classifications.map((c) => c.key)
    .filter((key) => completenessStepFor(key) !== null)
}

describe('which permits offer staff the completeness step', () => {
  it('in New Hampshire, only the building permit', () => {
    expect(offering()).toEqual(['nh.building_permit'])
  })

  it('in Maine, the building and shoreland permits and the wastewater permit, whose completeness date is met on completeness', () => {
    setActivePackForTest(ME_PACK)
    expect(offering()).toEqual([
      'me.building_permit',
      'me.shoreland_permit',
      'me.subsurface_wastewater',
    ])
    expect(completenessStepFor('me.shoreland_permit')).toBe('starts_decision_clock')
    expect(completenessStepFor('me.subsurface_wastewater')).toBe('meets_completeness_clock')
  })

  it('keeps a view marked as a building permit offering it', () => {
    expect(offersCompleteness({ isBuildingPermit: true })).toBe(true)
    expect(offersCompleteness({ isBuildingPermit: false, classification: 'nh.other' })).toBe(false)
  })
})
