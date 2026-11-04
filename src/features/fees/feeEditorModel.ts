import type { FeeExpr, FeeScheduleBody, FeeSource, FeeTier } from '@/features/fees/feeSchema'

export const AFTER_THE_FACT_FIELD = 'after_the_fact'

export type FeeBase =
  | { kind: 'flat'; cents: number }
  | { kind: 'per_unit'; rows: { source: FeeSource; centsPerUnit: number }[] }
  | { kind: 'tiered'; source: FeeSource; mode: 'graduated' | 'bracket'; tiers: FeeTier[] }

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
  if (expr.op === 'per_unit') {
    return { kind: 'per_unit', rows: [{ source: expr.source, centsPerUnit: expr.centsPerUnit }] }
  }
  if (expr.op === 'sum') {
    const rows: { source: FeeSource; centsPerUnit: number }[] = []
    for (const part of expr.of) {
      if (part.op !== 'per_unit') return null
      rows.push({ source: part.source, centsPerUnit: part.centsPerUnit })
    }
    return { kind: 'per_unit', rows }
  }
  if (expr.op === 'tiered') {
    return { kind: 'tiered', source: expr.source, mode: expr.mode, tiers: expr.tiers }
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
    return { op: 'tiered', source: base.source, mode: base.mode, tiers: base.tiers }
  }
  const parts: FeeExpr[] = base.rows.map((r) => ({
    op: 'per_unit',
    source: r.source,
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
