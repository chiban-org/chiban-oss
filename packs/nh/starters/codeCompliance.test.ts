import { NH_STARTERS } from '@packs/nh/starters'
import { describe, expect, it } from 'vitest'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
import { computeFees } from '@/features/fees/computeFees'
import { FeeScheduleBodySchema } from '@/features/fees/feeSchema'
import { loadPack } from '@/features/packs/loadPack'

const NEW_PREFIXES = ['DW', 'SG', 'HO', 'AR', 'SA', 'CO', 'SC', 'TS', 'STR', 'EC', 'TUP']

describe('code and compliance starters', () => {
  it('fifteen code and compliance starters with unique prefixes', () => {
    const prefixes = NH_STARTERS.filter(
      (s) => s.applicationType.workflow.closesOn !== 'staff_closes',
    ).map((s) => s.applicationType.prefix)
    expect(prefixes).toHaveLength(15)
    expect(new Set(NH_STARTERS.map((s) => s.applicationType.prefix)).size).toBe(NH_STARTERS.length)
    for (const prefix of NEW_PREFIXES) expect(prefixes).toContain(prefix)
  })

  it('every new starter validates against ApplicationTypeBodySchema and FeeScheduleBody', () => {
    for (const prefix of NEW_PREFIXES) {
      const starter = NH_STARTERS.find((s) => s.applicationType.prefix === prefix)
      expect(starter, prefix).toBeDefined()
      expect(ApplicationTypeBodySchema.safeParse(starter?.applicationType).success).toBe(true)
      expect(FeeScheduleBodySchema.safeParse(starter?.feeSchedule).success).toBe(true)
    }
  })

  it('septic cap-off doubles to 9000 cents after the fact', () => {
    const starter = NH_STARTERS.find((s) => s.applicationType.prefix === 'SC')
    if (starter === undefined) throw new Error('no SC starter')
    const price = (afterTheFact: boolean) =>
      computeFees(starter.feeSchedule, {
        values: { after_the_fact: afterTheFact },
        facts: { classification: 'residential', dwellingUnits: 1, afterTheFact },
        counts: { abutters: { state: 'known', value: 0, asOf: '2027-03-01' } },
        stage: 'at_intake',
        overrides: [],
      }).totalCents
    expect(price(false)).toBe(4500)
    expect(price(true)).toBe(9000)
  })

  it('registration types bind town.registration.expiration', () => {
    for (const prefix of ['AR', 'STR']) {
      const starter = NH_STARTERS.find((s) => s.applicationType.prefix === prefix)
      expect(starter?.applicationType.bindings).toContain('town.registration.expiration')
      expect(starter?.applicationType.workflow.closesOn).toBe('expiration')
    }
  })

  it('temporary structures bind town.temporary.expiration', () => {
    const starter = NH_STARTERS.find((s) => s.applicationType.prefix === 'TS')
    expect(starter?.applicationType.bindings).toContain('town.temporary.expiration')
  })

  it('the certificate of occupancy request has an existing structure and a change of use mode', () => {
    const starter = NH_STARTERS.find((s) => s.applicationType.prefix === 'CO')
    const mode = starter?.form.fields.find((f) => f.key === 'mode')
    expect(mode?.options?.map((o) => o.value)).toEqual(['existing_structure', 'change_of_use'])
  })

  it('the energy code certificate costs nothing and asks for a report only on the trade-off and performance paths', () => {
    const starter = NH_STARTERS.find((s) => s.applicationType.prefix === 'EC')
    expect(starter?.feeSchedule.lines.map((l) => l.expr)).toEqual([{ op: 'flat', cents: 0 }])
    const docs = starter?.applicationType.documents ?? []
    expect(docs.find((d) => d.key === 'ec1_form')).toMatchObject({
      stage: 'to_file',
      waivable: false,
    })
    expect(docs.find((d) => d.key === 'ec1_form')?.requiredIf).toBeUndefined()
    expect(docs.find((d) => d.key === 'energy_compliance_report')?.requiredIf).toEqual({
      field: 'compliance_path',
      op: 'in',
      value: ['ua_tradeoff', 'performance'],
    })
    expect(starter?.form.fields.find((f) => f.key === 'compliance_path')?.options).toHaveLength(3)
  })

  it('the temporary use permit costs 2500 cents, takes dates, and needs a sketch of the setup', () => {
    const starter = NH_STARTERS.find((s) => s.applicationType.prefix === 'TUP')
    expect(starter?.feeSchedule.lines.map((l) => l.expr)).toEqual([{ op: 'flat', cents: 2500 }])
    const dates = starter?.form.fields.filter((f) => f.type === 'date').map((f) => f.key)
    expect(dates).toEqual(['start_date', 'end_date'])
    const keys = (starter?.applicationType.documents ?? []).map((d) => d.key)
    expect(keys).toEqual(['tup_setup_sketch', 'property_owner_consent'])
    expect(starter?.applicationType.bindings).not.toContain('town.temporary.expiration')
  })

  it('temporary use and temporary structure share no key or prefix', () => {
    const ts = NH_STARTERS.find((s) => s.applicationType.prefix === 'TS')
    const tup = NH_STARTERS.find((s) => s.applicationType.prefix === 'TUP')
    expect(tup?.id).not.toBe(ts?.id)
    expect(tup?.form.key).not.toBe(ts?.form.key)
    expect(tup?.feeSchedule.key).not.toBe(ts?.feeSchedule.key)
    expect(tup?.applicationType.key).not.toBe(ts?.applicationType.key)
  })

  it('local classifications exist and the town rules cite no statute', () => {
    const pack = loadPack()
    expect(pack.classifications.map((c) => c.key)).toEqual(
      expect.arrayContaining(['nh.local_zoning_permit', 'nh.local_permit_other']),
    )
    for (const key of [
      'town.registration.validity',
      'town.registration.expiration',
      'town.temporary.validity',
      'town.temporary.expiration',
    ]) {
      const rule = pack.rules.find((r) => r.key === key)
      expect(rule?.citation).toEqual({ label: 'Town rule', url: null })
    }
  })
})
