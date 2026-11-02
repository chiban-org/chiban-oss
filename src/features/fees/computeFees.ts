import type { FeeExpr, FeeScheduleBody, FeeSource, FeeStage } from '@/features/fees/feeSchema'
import type { Sourced } from '@/features/fees/sourced'
import { evaluateCondition } from '@/features/forms/condition'
import type { FieldValue, ProjectFacts } from '@/features/forms/validateSubmission'
import type { HonestValue } from '@/features/honest/honest'
import { formatCents } from '@/lib/money'
import { words } from '@/lib/words'

const SCALE = 10_000n
const HALF = SCALE / 2n

export interface FeeOverrideInput {
  feeCode: string
  kind: 'waive' | 'set_amount'
  amountCents: number | null
}

export interface FeeContext {
  values: Record<string, FieldValue>
  facts: ProjectFacts
  counts: { abutters: HonestValue<number> }
  stage: FeeStage
  overrides: FeeOverrideInput[]
}

export interface FeeLineResult {
  code: string
  label: string
  due: FeeStage
  amount: Sourced<number> | { pending: string }
  explanation: string[]
}

export interface FeeComputation {
  lines: FeeLineResult[]
  totalCents: number | null
  complete: boolean
}

class Pending extends Error {}

interface Node {
  scaledCents: bigint
  steps: string[]
}

function toScaled(text: string): bigint {
  const negative = text.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? text.slice(1) : text).split('.')
  const digits = BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, '0').slice(0, 4))
  return negative ? -digits : digits
}

function scaledFromNumber(n: number): bigint {
  return BigInt(Math.round(n * Number(SCALE)))
}

function roundHalfUp(scaledCents: bigint): bigint {
  return (scaledCents + HALF) / SCALE
}

function quantity(source: FeeSource, ctx: FeeContext): bigint {
  if (source.kind === 'field') {
    const raw = ctx.values[source.field]
    if (raw === undefined || typeof raw === 'boolean' || Array.isArray(raw)) return 0n
    return toScaled(String(raw))
  }
  if (source.what === 'dwelling_units') return BigInt(ctx.facts.dwellingUnits ?? 0) * SCALE
  if (ctx.counts.abutters.state !== 'known') throw new Pending('Abutter list not yet issued')
  return BigInt(ctx.counts.abutters.value) * SCALE
}

function unitRate(centsPerUnit: number): string {
  if (Number.isInteger(centsPerUnit)) return formatCents(centsPerUnit)
  return `$${(centsPerUnit / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

function sourceLabel(source: FeeSource): string {
  return source.kind === 'field' ? words(source.field) : words(source.what)
}

function evalTiered(expr: Extract<FeeExpr, { op: 'tiered' }>, ctx: FeeContext): Node {
  const qty = quantity(expr.source, ctx)
  let lower = 0n
  let total = 0n
  for (const tier of expr.tiers) {
    const upper = tier.upTo === null ? null : scaledFromNumber(tier.upTo)
    const reached = qty > lower
    const contains = reached && (upper === null || qty <= upper)
    const rate = scaledFromNumber(tier.centsPerUnit ?? 0)
    const flat = BigInt(tier.flatCents ?? 0) * SCALE * SCALE
    if (expr.mode === 'bracket' && contains) {
      total = qty * rate + flat
      break
    }
    if (expr.mode === 'graduated' && reached) {
      const slice = (upper === null || qty < upper ? qty : upper) - lower
      total += slice * rate + flat
    }
    if (upper === null) break
    lower = upper
  }
  return {
    scaledCents: total / SCALE,
    steps: [`${expr.mode} tiers on ${sourceLabel(expr.source)}`],
  }
}

function evalExpr(expr: FeeExpr, ctx: FeeContext): Node {
  switch (expr.op) {
    case 'flat':
      return {
        scaledCents: BigInt(expr.cents) * SCALE,
        steps: [`Flat fee ${formatCents(expr.cents)}`],
      }
    case 'per_unit': {
      const qty = quantity(expr.source, ctx)
      const product = (qty * scaledFromNumber(expr.centsPerUnit)) / SCALE
      return {
        scaledCents: roundHalfUp(product) * SCALE,
        steps: [`${sourceLabel(expr.source)} at ${unitRate(expr.centsPerUnit)} per unit`],
      }
    }
    case 'tiered': {
      const node = evalTiered(expr, ctx)
      return { scaledCents: roundHalfUp(node.scaledCents) * SCALE, steps: node.steps }
    }
    case 'minimum': {
      const inner = evalExpr(expr.of, ctx)
      const floor = BigInt(expr.cents) * SCALE
      const applied = inner.scaledCents < floor
      return {
        scaledCents: applied ? floor : inner.scaledCents,
        steps: [...inner.steps, `Minimum ${formatCents(expr.cents)}${applied ? ' applied' : ''}`],
      }
    }
    case 'sum': {
      const parts = expr.of.map((e) => evalExpr(e, ctx))
      return {
        scaledCents: parts.reduce((acc, p) => acc + p.scaledCents, 0n),
        steps: parts.flatMap((p) => p.steps),
      }
    }
    case 'conditional_multiplier': {
      const inner = evalExpr(expr.of, ctx)
      const applies = evaluateCondition(expr.when, { ...ctx.values, ...ctx.facts })
      if (!applies) return inner
      const product = (inner.scaledCents * scaledFromNumber(expr.factor)) / SCALE
      return {
        scaledCents: roundHalfUp(product) * SCALE,
        steps: [...inner.steps, `Multiplied by ${expr.factor}`],
      }
    }
  }
}

function priceLine(line: FeeScheduleBody['lines'][number], ctx: FeeContext): FeeLineResult {
  const head = { code: line.code, label: line.label, due: line.due }
  try {
    const node = evalExpr(line.expr, ctx)
    const computed = Number(node.scaledCents / SCALE)
    const override = ctx.overrides.find((o) => o.feeCode === line.code)
    if (override === undefined) {
      return {
        ...head,
        amount: { value: computed, source: 'town_setting', replaced: null },
        explanation: node.steps,
      }
    }
    const value = override.kind === 'waive' ? 0 : (override.amountCents ?? 0)
    return {
      ...head,
      amount: {
        value,
        source: 'manual_override',
        replaced: { value: computed, source: 'town_setting' },
      },
      explanation: [
        ...node.steps,
        override.kind === 'waive' ? 'Waived' : `Set to ${formatCents(value)}`,
      ],
    }
  } catch (e) {
    if (e instanceof Pending) return { ...head, amount: { pending: e.message }, explanation: [] }
    throw e
  }
}

export function computeFees(schedule: FeeScheduleBody, ctx: FeeContext): FeeComputation {
  const lines = schedule.lines.filter((l) => l.due === ctx.stage).map((l) => priceLine(l, ctx))
  const complete = lines.every((l) => 'value' in l.amount)
  const totalCents = complete
    ? lines.reduce((acc, l) => acc + ('value' in l.amount ? l.amount.value : 0), 0)
    : null
  return { lines, totalCents, complete }
}
