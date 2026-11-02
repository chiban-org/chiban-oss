import { describe, expect, it } from 'vitest'
import { computeFees } from '@/features/fees/computeFees'
import { type FeeScheduleBody, FeeScheduleBodySchema } from '@/features/fees/feeSchema'
import type { FieldValue, ProjectFacts } from '@/features/forms/validateSubmission'
import type { HonestValue } from '@/features/honest/honest'

const BUILDING: FeeScheduleBody = FeeScheduleBodySchema.parse({
  key: 'bp',
  lines: [
    {
      code: 'building',
      label: 'Building permit fee',
      due: 'at_approval',
      expr: {
        op: 'conditional_multiplier',
        when: { field: 'after_the_fact', op: 'is_true' },
        factor: 2,
        of: {
          op: 'minimum',
          cents: 4000,
          of: {
            op: 'sum',
            of: [
              {
                op: 'per_unit',
                source: { kind: 'field', field: 'finished_sq_ft' },
                centsPerUnit: 35,
              },
              {
                op: 'per_unit',
                source: { kind: 'field', field: 'unfinished_sq_ft' },
                centsPerUnit: 20,
              },
              {
                op: 'per_unit',
                source: { kind: 'field', field: 'commercial_sq_ft' },
                centsPerUnit: 40,
              },
            ],
          },
        },
      },
    },
    { code: 'renewal', label: 'Renewal', due: 'at_renewal', expr: { op: 'flat', cents: 4500 } },
  ],
})

const TRADE: FeeScheduleBody = FeeScheduleBodySchema.parse({
  key: 'el',
  lines: [
    {
      code: 'electrical',
      label: 'Electrical permit fee',
      due: 'at_intake',
      expr: {
        op: 'conditional_multiplier',
        when: { field: 'after_the_fact', op: 'is_true' },
        factor: 2,
        of: { op: 'flat', cents: 4500 },
      },
    },
  ],
})

const FACTS: ProjectFacts = { classification: 'residential', dwellingUnits: 1, afterTheFact: false }
const KNOWN: HonestValue<number> = { state: 'known', value: 4, asOf: '2027-03-01' }

function price(
  schedule: FeeScheduleBody,
  values: Record<string, FieldValue>,
  extra: Partial<Parameters<typeof computeFees>[1]> = {},
) {
  return computeFees(schedule, {
    values,
    facts: FACTS,
    counts: { abutters: KNOWN },
    stage: 'at_approval',
    overrides: [],
    ...extra,
  })
}

const amountOf = (r: ReturnType<typeof computeFees>, code: string) => {
  const line = r.lines.find((l) => l.code === code)
  return line !== undefined && 'value' in line.amount ? line.amount.value : null
}

describe('computeFees', () => {
  it('1000 finished plus 500 unfinished residential sq ft is 45000 cents', () => {
    const r = price(BUILDING, { finished_sq_ft: '1000', unfinished_sq_ft: '500' })
    expect(r.totalCents).toBe(45000)
    expect(r.complete).toBe(true)
  })

  it('100 finished sq ft hits the 4000 cent minimum', () => {
    expect(price(BUILDING, { finished_sq_ft: '100' }).totalCents).toBe(4000)
  })

  it('after-the-fact doubles after the minimum', () => {
    const atf = { ...FACTS, afterTheFact: true }
    const a = price(BUILDING, { finished_sq_ft: '1000', after_the_fact: true }, { facts: atf })
    const b = price(BUILDING, { finished_sq_ft: '100', after_the_fact: true }, { facts: atf })
    expect(a.totalCents).toBe(70000)
    expect(b.totalCents).toBe(8000)
  })

  it('2000 commercial sq ft is 80000', () => {
    expect(price(BUILDING, { commercial_sq_ft: '2000' }).totalCents).toBe(80000)
  })

  it('333.33 finished sq ft rounds half up to 11667', () => {
    expect(price(BUILDING, { finished_sq_ft: '333.33' }).totalCents).toBe(11667)
  })

  it('trade permit is 4500 due at intake', () => {
    const r = price(TRADE, {}, { stage: 'at_intake' })
    expect(r.totalCents).toBe(4500)
    expect(r.lines[0]?.due).toBe('at_intake')
  })

  it('renewal line appears only at the renewal stage', () => {
    const at = price(BUILDING, { finished_sq_ft: '1000' }, { stage: 'at_renewal' })
    expect(at.lines.map((l) => l.code)).toEqual(['renewal'])
    expect(at.totalCents).toBe(4500)
    expect(price(BUILDING, { finished_sq_ft: '1000' }).lines.map((l) => l.code)).toEqual([
      'building',
    ])
  })

  it('graduated tiers 1500 units over [1000 at 10, rest at 5] is 12500; bracket is 7500', () => {
    const tiers = [
      { upTo: 1000, centsPerUnit: 10 },
      { upTo: null, centsPerUnit: 5 },
    ]
    const make = (mode: 'graduated' | 'bracket') =>
      FeeScheduleBodySchema.parse({
        key: 't',
        lines: [
          {
            code: 'x',
            label: 'X',
            due: 'at_approval',
            expr: { op: 'tiered', source: { kind: 'field', field: 'units' }, mode, tiers },
          },
        ],
      })
    expect(price(make('graduated'), { units: '1500' }).totalCents).toBe(12500)
    expect(price(make('bracket'), { units: '1500' }).totalCents).toBe(7500)
  })

  it('three dwelling units at 2500 is 7500', () => {
    const schedule = FeeScheduleBodySchema.parse({
      key: 'u',
      lines: [
        {
          code: 'units',
          label: 'Units',
          due: 'at_approval',
          expr: {
            op: 'per_unit',
            source: { kind: 'count_of', what: 'dwelling_units' },
            centsPerUnit: 2500,
          },
        },
      ],
    })
    expect(price(schedule, {}, { facts: { ...FACTS, dwellingUnits: 3 } }).totalCents).toBe(7500)
  })

  it('unknown abutter count leaves the line pending and the total null', () => {
    const schedule = FeeScheduleBodySchema.parse({
      key: 'a',
      lines: [
        {
          code: 'notice',
          label: 'Abutter notice',
          due: 'at_approval',
          expr: {
            op: 'per_unit',
            source: { kind: 'count_of', what: 'abutters_on_issued_list' },
            centsPerUnit: 800,
          },
        },
      ],
    })
    const r = price(schedule, {}, { counts: { abutters: { state: 'unknown' } } })
    expect(r.lines[0]?.amount).toEqual({ pending: 'Abutter list not yet issued' })
    expect(r.complete).toBe(false)
    expect(r.totalCents).toBeNull()
  })

  it('waive override shows source manual_override with replaced 45000', () => {
    const r = price(
      BUILDING,
      { finished_sq_ft: '1000', unfinished_sq_ft: '500' },
      { overrides: [{ feeCode: 'building', kind: 'waive', amountCents: null }] },
    )
    const line = r.lines[0]
    expect(line && 'value' in line.amount && line.amount).toEqual({
      value: 0,
      source: 'manual_override',
      replaced: { value: 45000, source: 'town_setting' },
    })
    expect(r.totalCents).toBe(0)
  })

  it('set_amount override of 30000 shows replaced 45000', () => {
    const r = price(
      BUILDING,
      { finished_sq_ft: '1000', unfinished_sq_ft: '500' },
      { overrides: [{ feeCode: 'building', kind: 'set_amount', amountCents: 30000 }] },
    )
    expect(amountOf(r, 'building')).toBe(30000)
    const line = r.lines[0]
    expect(line && 'replaced' in line.amount && line.amount.replaced?.value).toBe(45000)
  })

  it('explains the computation steps', () => {
    const r = price(BUILDING, { finished_sq_ft: '100' })
    expect(r.lines[0]?.explanation.join(' ')).toMatch(/minimum/i)
  })
})
