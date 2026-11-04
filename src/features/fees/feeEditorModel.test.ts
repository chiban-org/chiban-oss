import { NH_STARTERS } from '@packs/nh/starters'
import { describe, expect, it } from 'vitest'
import { buildExpr, parseLine } from '@/features/fees/feeEditorModel'
import type { FeeExpr } from '@/features/fees/feeSchema'

const building = NH_STARTERS.find((s) => s.id === 'nh.starter.building')

describe('fee editor model', () => {
  it('parses the building starter line into base, minimum, and multiplier and builds the same expression back', () => {
    const line = building?.feeSchedule.lines[0]
    if (line === undefined) throw new Error('missing')
    const model = parseLine(line)
    expect(model).toMatchObject({
      base: { kind: 'per_unit' },
      minimumCents: 4000,
      multiplier: { factor: 2 },
    })
    if (model === null) throw new Error('unparsed')
    expect(buildExpr(model)).toEqual(line.expr)
  })

  it('parses a flat line and a bare per-unit line', () => {
    const flat = parseLine({
      code: 'renewal',
      label: 'Renewal',
      due: 'at_renewal',
      expr: { op: 'flat', cents: 4500 },
    })
    expect(flat).toMatchObject({
      base: { kind: 'flat', cents: 4500 },
      minimumCents: null,
      multiplier: null,
    })
    const unit: FeeExpr = {
      op: 'per_unit',
      source: { kind: 'field', field: 'a' },
      centsPerUnit: 10,
    }
    const parsed = parseLine({ code: 'u', label: 'U', due: 'at_intake', expr: unit })
    expect(parsed && buildExpr(parsed)).toEqual(unit)
  })

  it('parses and rebuilds a tiered line', () => {
    const expr: FeeExpr = {
      op: 'tiered',
      source: { kind: 'field', field: 'units' },
      mode: 'graduated',
      tiers: [
        { upTo: 1000, centsPerUnit: 10 },
        { upTo: null, centsPerUnit: 5 },
      ],
    }
    const parsed = parseLine({ code: 't', label: 'T', due: 'at_approval', expr })
    expect(parsed?.base.kind).toBe('tiered')
    expect(parsed && buildExpr(parsed)).toEqual(expr)
  })

  it('a sum of two rows builds a sum and a single row builds a per_unit', () => {
    const model = parseLine({
      code: 'u',
      label: 'U',
      due: 'at_intake',
      expr: {
        op: 'sum',
        of: [
          { op: 'per_unit', source: { kind: 'field', field: 'a' }, centsPerUnit: 10 },
          { op: 'per_unit', source: { kind: 'field', field: 'b' }, centsPerUnit: 20 },
        ],
      },
    })
    if (model === null || model.base.kind !== 'per_unit') throw new Error('shape')
    expect(
      buildExpr({ ...model, base: { kind: 'per_unit', rows: model.base.rows.slice(0, 1) } }).op,
    ).toBe('per_unit')
    expect(buildExpr(model).op).toBe('sum')
  })

  it('round trips a per-unit line that counts abutters on the issued list', () => {
    const expr: FeeExpr = {
      op: 'per_unit',
      source: { kind: 'count_of', what: 'abutters_on_issued_list' },
      centsPerUnit: 1200,
    }
    const parsed = parseLine({ code: 'mail', label: 'Mailing', due: 'at_notice', expr })
    expect(parsed?.base).toEqual({
      kind: 'per_unit',
      rows: [{ source: { kind: 'count_of', what: 'abutters_on_issued_list' }, centsPerUnit: 1200 }],
    })
    expect(parsed && buildExpr(parsed)).toEqual(expr)
  })

  it('returns null for an expression the editor cannot represent', () => {
    const odd: FeeExpr = {
      op: 'conditional_multiplier',
      when: { field: 'something_else', op: 'is_true' },
      factor: 3,
      of: { op: 'flat', cents: 1 },
    }
    expect(parseLine({ code: 'x', label: 'X', due: 'at_intake', expr: odd })).toBeNull()
  })
})
