import { describe, expect, it } from 'vitest'
import { packById, withPackForTest } from '@/features/packs/registry'
import type { StatePack } from '@/features/packs/schema'
import { XX_PACK } from '@/test/packs/xx'

const EXPECTED_LABELS = {
  nh: {
    administrativeOfficials: ['building inspector', 'zoning administrator'],
    recordsRequestPrefix: 'RK',
    timeStatementDateLabel: 'Response by',
  },
  me: {
    administrativeOfficials: ['code enforcement officer'],
    recordsRequestPrefix: 'FOAA',
    timeStatementDateLabel: 'Estimated response date (a good faith, nonbinding estimate)',
  },
  xx: {
    administrativeOfficials: ['permit warden'],
    recordsRequestPrefix: 'VR',
    timeStatementDateLabel: 'Answer expected by',
  },
} as const

const PACKS: readonly [
  string,
  () => StatePack,
  (typeof EXPECTED_LABELS)[keyof typeof EXPECTED_LABELS],
][] = [
  ['nh', () => packById('nh'), EXPECTED_LABELS.nh],
  ['me', () => packById('me'), EXPECTED_LABELS.me],
  ['xx', () => XX_PACK, EXPECTED_LABELS.xx],
]

describe('contract 0.10.0 pack fields', () => {
  for (const [id, load, expected] of PACKS) {
    describe(id, () => {
      it('carries the new labels', () => {
        const pack = load()
        withPackForTest(pack, () => {
          expect(pack.labels.administrativeOfficials).toEqual(expected.administrativeOfficials)
          expect(pack.labels.recordsRequestPrefix).toBe(expected.recordsRequestPrefix)
          expect(pack.labels.timeStatementDateLabel).toBe(expected.timeStatementDateLabel)
          expect(pack.labels.recordsRequestPrefix).toMatch(/^[A-Z]{2,4}$/)
          expect(pack.labels.administrativeOfficials.length).toBeGreaterThan(0)
        })
      })

      it('groups only declared classifications under the building office', () => {
        const pack = load()
        withPackForTest(pack, () => {
          expect(pack.portal.officeClassifications.length).toBeGreaterThan(0)
          for (const key of pack.portal.officeClassifications) {
            expect(pack.classificationKeys).toContain(key)
          }
        })
      })
    })
  }

  for (const id of ['nh', 'me'] as const) {
    it(`${id} common jobs name starter prefixes`, () => {
      const pack = packById(id)
      const prefixes = new Set(pack.starters.map((s) => s.applicationType.prefix))
      expect(pack.portal.commonJobs.length).toBeGreaterThan(0)
      for (const job of pack.portal.commonJobs) expect(prefixes).toContain(job.key)
    })
  }

  it('moves the New Hampshire common jobs into the pack', () => {
    expect(packById('nh').portal.commonJobs.map((j) => j.key)).toEqual([
      'BP',
      'EL',
      'PL',
      'MG',
      'DW',
      'SG',
    ])
    expect(packById('nh').portal.officeClassifications).toEqual([
      'nh.building_permit',
      'nh.trade_permit',
    ])
  })

  it('lists the Maine common jobs and office classifications', () => {
    const portal = packById('me').portal
    expect(portal.commonJobs).toEqual([
      {
        key: 'BP',
        title: 'Build or add on',
        description: 'A new building, an addition, a deck, a garage or a shed.',
      },
      {
        key: 'DEM',
        title: 'Tear down a building',
        description: 'Demolishing a building or part of one.',
      },
      {
        key: 'IP',
        title: 'Plumbing inside a building',
        description: 'New or moved fixtures, a water heater, or water and drain piping.',
      },
      { key: 'SSW', title: 'Septic system', description: 'A new or replacement septic system.' },
      {
        key: 'SLZ',
        title: 'Work near a lake, river or wetland',
        description: 'Building, clearing or filling close to the water.',
      },
      { key: 'SG', title: 'Sign', description: 'A new sign, or a change to an existing one.' },
    ])
    expect(portal.officeClassifications).toEqual([
      'me.building_permit',
      'me.demolition_permit',
      'me.internal_plumbing',
      'me.subsurface_wastewater',
      'me.seasonal_conversion',
      'me.shoreland_permit',
      'me.land_use_permit',
      'me.sign_permit',
    ])
  })
})
