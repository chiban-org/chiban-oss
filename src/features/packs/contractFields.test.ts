import { describe, expect, it } from 'vitest'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
import { FeeScheduleBodySchema } from '@/features/fees/feeSchema'
import { FormFieldSchema } from '@/features/forms/formSchema'
import { ChecklistBodySchema } from '@/features/inspections/checklistSchema'
import { packById, withPackForTest } from '@/features/packs/registry'
import type { StarterBundle, StatePack } from '@/features/packs/schema'
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

const PROVENANCE = 'Chiban starting checklist. The town can edit it.'

function starterOf(pack: StatePack, prefix: string): StarterBundle {
  const found = pack.starters.find((s) => s.applicationType.prefix === prefix)
  if (found === undefined) throw new Error(`no starter ${prefix}`)
  return found
}

function factFields(pack: StatePack) {
  return pack.starters.flatMap((s) =>
    s.form.fields.map((f) => ({ prefix: s.applicationType.prefix, field: f })),
  )
}

describe('contract 0.10.0 starter fields', () => {
  it('accepts the new fields and refuses a wrong type', () => {
    const me = packById('me')
    withPackForTest(me, () => {
      const type = starterOf(me, 'BP').applicationType
      const withFlag = (value: unknown) =>
        ApplicationTypeBodySchema.safeParse({
          ...type,
          workflow: { ...type.workflow, reviewRequired: value },
        }).success
      expect(withFlag(false)).toBe(true)
      expect(withFlag(true)).toBe(true)
      expect(withFlag('no')).toBe(false)

      const fees = starterOf(me, 'BP').feeSchedule
      const line = fees.lines[0]
      if (line === undefined) throw new Error('no fee line')
      const withTownSets = (value: unknown) =>
        FeeScheduleBodySchema.safeParse({ ...fees, lines: [{ ...line, townSets: value }] }).success
      expect(withTownSets(true)).toBe(true)
      expect(withTownSets(false)).toBe(false)

      const list = starterOf(me, 'SLZ').checklists[0]
      if (list === undefined) throw new Error('no checklist')
      const withProvenance = (value: unknown) =>
        ChecklistBodySchema.safeParse({ ...list, provenance: value }).success
      expect(withProvenance(PROVENANCE)).toBe(true)
      expect(withProvenance(' ')).toBe(false)
      expect(withProvenance(3)).toBe(false)

      const field = { key: 'decision_date', label: 'Date', type: 'date', required: true }
      expect(FormFieldSchema.safeParse({ ...field, fact: 'appealedDecisionDate' }).success).toBe(
        true,
      )
      expect(FormFieldSchema.safeParse({ ...field, significanceFact: true }).success).toBe(true)
      expect(FormFieldSchema.safeParse({ ...field, significanceFact: 'yes' }).success).toBe(false)
    })
  })

  it('Maine staff permits skip the review step and board starters keep it', () => {
    const me = packById('me')
    const office = new Set(me.portal.officeClassifications)
    const staff = me.starters.filter((s) => office.has(s.applicationType.classification ?? ''))
    expect(staff).toHaveLength(8)
    for (const s of staff) expect(s.applicationType.workflow.reviewRequired, s.id).toBe(false)
    for (const s of me.starters.filter((x) => !staff.includes(x))) {
      expect(s.applicationType.workflow.reviewRequired, s.id).toBeUndefined()
    }
  })

  it('Maine fee lines for the town to set carry the flag, not a label suffix', () => {
    const me = packById('me')
    const flagged = me.starters.flatMap((s) =>
      s.feeSchedule.lines
        .filter((l) => l.townSets === true)
        .map((l) => `${s.applicationType.prefix}:${l.code}`),
    )
    expect(flagged.sort()).toEqual(
      [
        'BP:building',
        'SLZ:shoreland',
        'LU:land_use',
        'DEM:demolition',
        'SG:sign',
        'VAR:application',
        'VAR:notice_mail',
        'AA:application',
        'AA:notice_mail',
        'SUB:application',
        'SUB:receipt_notice',
        'SPR:application',
        'SPR:notice_mail',
      ].sort(),
    )
    for (const s of me.starters) {
      for (const l of s.feeSchedule.lines) expect(l.label).not.toMatch(/Set your fee/)
    }
  })

  it('Maine starting checklists carry their provenance', () => {
    const me = packById('me')
    for (const prefix of ['SLZ', 'SC']) {
      const lists = starterOf(me, prefix).checklists
      expect(lists.map((c) => c.label)).toEqual(['Start of work', 'Final inspection'])
      for (const c of lists) expect(c.provenance).toBe(PROVENANCE)
    }
  })

  it('tags the appealed decision date and the significance facts', () => {
    const me = packById('me')
    const appealed = factFields(me).filter((f) => f.field.fact === 'appealedDecisionDate')
    expect(appealed.map((f) => `${f.prefix}:${f.field.key}`)).toEqual(['AA:decision_date'])
    const significance = factFields(me).filter((f) => f.field.significanceFact === true)
    expect(significance.map((f) => `${f.prefix}:${f.field.key}`).sort()).toEqual(
      [
        'SPR:building_footprint_sq_ft',
        'SPR:gross_floor_area_sq_ft',
        'SPR:disturbed_acres',
        'SUB:lot_count',
      ].sort(),
    )
  })

  it('New Hampshire starters carry none of the new values except the appeal date', () => {
    const nh = packById('nh')
    for (const s of nh.starters) {
      expect(s.applicationType.workflow.reviewRequired, s.id).toBeUndefined()
      for (const l of s.feeSchedule.lines) expect(l.townSets, s.id).toBeUndefined()
      for (const c of s.checklists) expect(c.provenance, s.id).toBeUndefined()
      for (const f of s.form.fields) expect(f.significanceFact, s.id).toBeUndefined()
    }
    const appealed = factFields(nh).filter((f) => f.field.fact === 'appealedDecisionDate')
    expect(appealed.map((f) => `${f.prefix}:${f.field.key}`)).toEqual(['AAD:decision_date'])
  })

  it('bumps the board and permit starter versions once', () => {
    const me = packById('me')
    for (const s of me.starters) expect(s.version, s.id).toBe(2)
    const nhBoards = packById('nh').starters.filter((s) =>
      /\.(pb|zba)_/.test(s.applicationType.classification ?? ''),
    )
    expect(nhBoards.length).toBeGreaterThan(0)
    for (const s of nhBoards) expect(s.version, s.id).toBe(3)
  })

  it('names how the site plan hearing notice is given', () => {
    const rule = packById('me').manifest.rules.find((r) => r.key === 'town.sp.notice.hearing')
    expect(rule?.label).toBe('Site plan hearing public notice: how it is given')
  })
})
