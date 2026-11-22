import { ME_PACK } from '@packs/me'
import { describe, expect, it } from 'vitest'
import { withPackForTest } from '@/features/packs/registry'
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

const ME_TYPES = [
  { key: 'BP', label: 'Building permit', classification: 'me.building_permit' },
  { key: 'DEM', label: 'Demolition permit', classification: 'me.demolition_permit' },
  { key: 'IP', label: 'Internal plumbing permit', classification: 'me.internal_plumbing' },
  { key: 'LU', label: 'Land use permit', classification: 'me.land_use_permit' },
  { key: 'SC', label: 'Seasonal conversion permit', classification: 'me.seasonal_conversion' },
  { key: 'SG', label: 'Sign permit', classification: 'me.sign_permit' },
  { key: 'SLZ', label: 'Shoreland zoning permit', classification: 'me.shoreland_permit' },
  {
    key: 'SSW',
    label: 'Subsurface wastewater disposal permit',
    classification: 'me.subsurface_wastewater',
  },
  { key: 'SPR', label: 'Site plan review', classification: 'me.pb_site_plan' },
  { key: 'VAR', label: 'Variance', classification: 'me.boa_variance' },
] as const

describe('groupPortalTypes under the Maine pack', () => {
  const grouped = () => withPackForTest(ME_PACK, () => groupPortalTypes([...ME_TYPES]))

  it('leads with the Maine common jobs, in the pack order', () => {
    expect(grouped().common.map((c) => [c.key, c.title])).toEqual([
      ['BP', 'Build or add on'],
      ['DEM', 'Tear down a building'],
      ['IP', 'Plumbing inside a building'],
      ['SSW', 'Septic system'],
      ['SLZ', 'Work near a lake, river or wetland'],
      ['SG', 'Sign'],
    ])
  })

  it('puts the other office permits under Building office and lists every type once', () => {
    const { common, groups } = grouped()
    expect(groups.map((g) => [g.title, g.types.map((t) => t.key)])).toEqual([
      ['Building office', ['LU', 'SC']],
      ['Planning Board', ['SPR']],
      ['Board of Appeals', ['VAR']],
    ])
    const keys = [...common.map((c) => c.key), ...groups.flatMap((g) => g.types.map((t) => t.key))]
    expect(keys.filter((k) => k === 'DEM')).toEqual(['DEM'])
    expect([...keys].sort()).toEqual(ME_TYPES.map((t) => t.key).sort())
  })
})
