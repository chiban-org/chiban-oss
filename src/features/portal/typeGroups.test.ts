import { describe, expect, it } from 'vitest'
import { groupPortalTypes } from '@/features/portal/typeGroups'

const TYPES = [
  { key: 'AR', label: 'Alarm system registration', classification: 'nh.local_permit_other' },
  { key: 'BP', label: 'Building or demolition permit', classification: 'nh.building_permit' },
  { key: 'DW', label: 'Driveway permit', classification: 'nh.local_permit_other' },
  { key: 'EL', label: 'Electrical permit', classification: 'nh.trade_permit' },
  { key: 'SC', label: 'Septic or sewer cap-off permit', classification: 'nh.trade_permit' },
  { key: 'MSP', label: 'Minor site plan', classification: 'nh.pb_site_plan' },
  { key: 'VAR', label: 'Variance', classification: 'nh.zba_variance' },
  { key: 'SG', label: 'Sign permit', classification: 'nh.local_zoning_permit' },
] as const

describe('groupPortalTypes', () => {
  it('leads with the common jobs the town publishes, each with a plain description', () => {
    const { common } = groupPortalTypes([...TYPES])
    expect(common.map((c) => [c.key, c.title])).toEqual([
      ['BP', 'Build, add on or tear down'],
      ['EL', 'Electrical work'],
      ['DW', 'Driveway'],
      ['SG', 'Sign'],
    ])
    expect(common.every((c) => c.description.length > 0)).toBe(true)
  })

  it('groups the rest by who decides, without repeating a common job', () => {
    const { groups } = groupPortalTypes([...TYPES])
    expect(groups.map((g) => [g.title, g.types.map((t) => t.key)])).toEqual([
      ['Building office', ['SC']],
      ['Planning Board', ['MSP']],
      ['Zoning Board', ['VAR']],
      ['Registrations and other', ['AR']],
    ])
  })

  it('drops a group the town has no types for', () => {
    const { groups } = groupPortalTypes([TYPES[0], TYPES[1]])
    expect(groups.map((g) => g.title)).toEqual(['Registrations and other'])
  })
})
