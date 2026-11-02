import type { FeeExpr, FeeScheduleBody, FeeTier } from '@/features/fees/feeSchema'

export const AFTER_THE_FACT_FIELD = 'after_the_fact'

export type FeeBase =
  | { kind: 'flat'; cents: number }
  | { kind: 'per_unit'; rows: { field: string; centsPerUnit: number }[] }
  | { kind: 'tiered'; field: string; mode: 'graduated' | 'bracket'; tiers: FeeTier[] }

export interface FeeLineModel {
  code: string
  label: string
  due: FeeScheduleBody['lines'][number]['due']
  base: FeeBase
  minimumCents: number | null
  multiplier: { factor: number } | null
}

function parseBase(expr: FeeExpr): FeeBase | null {
  if (expr.op === 'flat') return { kind: 'flat', cents: expr.cents }
  if (expr.op === 'per_unit' && expr.source.kind === 'field') {
    return {
      kind: 'per_unit',
      rows: [{ field: expr.source.field, centsPerUnit: expr.centsPerUnit }],
    }
  }
  if (expr.op === 'sum') {
    const rows: { field: string; centsPerUnit: number }[] = []
    for (const part of expr.of) {
      if (part.op !== 'per_unit' || part.source.kind !== 'field') return null
      rows.push({ field: part.source.field, centsPerUnit: part.centsPerUnit })
    }
    return { kind: 'per_unit', rows }
  }
  if (expr.op === 'tiered' && expr.source.kind === 'field') {
    return { kind: 'tiered', field: expr.source.field, mode: expr.mode, tiers: expr.tiers }
  }
  return null
}

export function parseLine(line: FeeScheduleBody['lines'][number]): FeeLineModel | null {
  let expr = line.expr
  let multiplier: FeeLineModel['multiplier'] = null
  if (expr.op === 'conditional_multiplier') {
    const when = expr.when
    const isAfterTheFact =
      'field' in when && when.field === AFTER_THE_FACT_FIELD && when.op === 'is_true'
    if (!isAfterTheFact) return null
    multiplier = { factor: expr.factor }
    expr = expr.of
  }
  let minimumCents: number | null = null
  if (expr.op === 'minimum') {
    minimumCents = expr.cents
    expr = expr.of
  }
  const base = parseBase(expr)
  if (base === null) return null
  return { code: line.code, label: line.label, due: line.due, base, minimumCents, multiplier }
}

function buildBase(base: FeeBase): FeeExpr {
  if (base.kind === 'flat') return { op: 'flat', cents: base.cents }
  if (base.kind === 'tiered') {
    return {
      op: 'tiered',
      source: { kind: 'field', field: base.field },
      mode: base.mode,
      tiers: base.tiers,
    }
  }
  const parts: FeeExpr[] = base.rows.map((r) => ({
    op: 'per_unit',
    source: { kind: 'field', field: r.field },
    centsPerUnit: r.centsPerUnit,
  }))
  return parts.length === 1 && parts[0] !== undefined ? parts[0] : { op: 'sum', of: parts }
}

export function buildExpr(model: FeeLineModel): FeeExpr {
  let expr = buildBase(model.base)
  if (model.minimumCents !== null) expr = { op: 'minimum', cents: model.minimumCents, of: expr }
  if (model.multiplier !== null) {
    expr = {
      op: 'conditional_multiplier',
      when: { field: AFTER_THE_FACT_FIELD, op: 'is_true' },
      factor: model.multiplier.factor,
      of: expr,
    }
  }
  return expr
}
