import { ME_PACK } from '@packs/me'
import { afterEach, describe, expect, it } from 'vitest'
import {
  completenessCopy,
  completenessStepFor,
  offersCompleteness,
} from '@/features/applications/completenessStep'
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

const BP_RUNNING = {
  ruleKey: 'me.bp.decision',
  currentDue: { value: '2027-03-31' },
} as const

describe('the building permit completeness copy', () => {
  it('in New Hampshire, says marking complete starts the decision clock', () => {
    expect(completenessStepFor('nh.building_permit')).toBe('starts_decision_clock')
    expect(
      completenessCopy({ isBuildingPermit: true, classification: 'nh.building_permit' }),
    ).toEqual({
      pending:
        'The application has not been marked complete, so the decision clock has not started.',
      detail: 'The decision clock starts when the application is marked complete.',
      marked: 'Marked complete. The decision clock is running.',
    })
  })

  it('in Maine, says the decision deadline already runs from filing and gives its date', () => {
    setActivePackForTest(ME_PACK)
    expect(completenessStepFor('me.building_permit')).toBe('decision_clock_running')
    expect(
      completenessCopy({
        isBuildingPermit: true,
        classification: 'me.building_permit',
        clocks: [BP_RUNNING],
      }),
    ).toEqual({
      pending:
        'The application has not been marked complete. The decision deadline already runs from filing and falls on March 31, 2027.',
      detail:
        'The decision deadline runs from filing and falls on March 31, 2027. Marking the application complete does not change it.',
      marked: 'Marked complete. The decision deadline runs from filing.',
    })
  })

  it('in Maine, leaves the date out when the step has no decision clock', () => {
    setActivePackForTest(ME_PACK)
    expect(
      completenessCopy({ isBuildingPermit: true, classification: 'me.building_permit' }).pending,
    ).toBe(
      'The application has not been marked complete. The decision deadline already runs from filing.',
    )
  })
})
