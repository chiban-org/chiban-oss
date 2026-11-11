import { FEE_STAGE_TEXT } from '@/features/fees/feeRows'
import type { FeeExpr, FeeScheduleBody, FeeSource, FeeTier } from '@/features/fees/feeSchema'
import type { Condition } from '@/features/forms/condition'
import type { FormBody } from '@/features/forms/formSchema'
import { formatCents } from '@/lib/money'

const CENTS_PER_DOLLAR = 100

type FieldLabels = ReadonlyMap<string, string>

export function dollars(cents: number): string {
  if (cents % CENTS_PER_DOLLAR !== 0) return formatCents(cents)
  return `$${(cents / CENTS_PER_DOLLAR).toLocaleString('en-US')}`
}

export function fieldLabels(form: FormBody): FieldLabels {
  return new Map(form.fields.map((field) => [field.key, field.label]))
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

const SQ_FT_LABEL = /^(.*) \(sq ft\)$/
const COUNT_LABEL = /^Number of (.*)s$/

function perUnit(source: FeeSource, labels: FieldLabels): string {
  if (source.kind === 'count_of') {
    return source.what === 'dwelling_units' ? 'per dwelling unit' : 'per abutter on the notice list'
  }
  const label = labels.get(source.field) ?? source.field
  const sqFt = SQ_FT_LABEL.exec(label)
  if (sqFt?.[1] !== undefined) return `per sq ft of ${lowerFirst(sqFt[1])}`
  const count = COUNT_LABEL.exec(label)
  if (count?.[1] !== undefined) return `per ${count[1]}`
  return `per unit of “${label}”`
}

function sourceName(source: FeeSource, labels: FieldLabels): string {
  if (source.kind === 'count_of') {
    return source.what === 'dwelling_units' ? 'dwelling units' : 'abutters on the notice list'
  }
  return `“${labels.get(source.field) ?? source.field}”`
}

function tierText(tier: FeeTier): string {
  const amount =
    tier.flatCents !== undefined
      ? dollars(tier.flatCents)
      : `${dollars(tier.centsPerUnit ?? 0)} each`
  return tier.upTo === null ? `${amount} above that` : `${amount} up to ${tier.upTo}`
}

function conditionText(condition: Condition, labels: FieldLabels): string {
  if ('field' in condition) {
    const label = labels.get(condition.field) ?? condition.field
    switch (condition.op) {
      case 'is_true':
        return `when “${label}” is checked`
      case 'is_false':
        return `when “${label}” is not checked`
      case 'equals':
        return `when “${label}” is ${String(condition.value)}`
      case 'not_equals':
        return `when “${label}” is not ${String(condition.value)}`
      case 'in':
        return `when “${label}” is one of ${String(condition.value)}`
      case 'gt':
        return `when “${label}” is more than ${String(condition.value)}`
      case 'lt':
        return `when “${label}” is less than ${String(condition.value)}`
    }
  }
  return 'in some cases'
}

function factorText(factor: number): string {
  if (factor === 2) return 'doubled'
  if (factor === 0.5) return 'halved'
  return `multiplied by ${factor}`
}

export function feeExprText(expr: FeeExpr, labels: FieldLabels): string {
  switch (expr.op) {
    case 'flat':
      return expr.cents === 0 ? 'no charge' : dollars(expr.cents)
    case 'per_unit':
      return `${dollars(expr.centsPerUnit)} ${perUnit(expr.source, labels)}`
    case 'minimum':
      return `${feeExprText(expr.of, labels)}, at least ${dollars(expr.cents)}`
    case 'tiered':
      return `by ${sourceName(expr.source, labels)}: ${expr.tiers.map(tierText).join(', ')}`
    case 'sum':
      return expr.of.map((part) => feeExprText(part, labels)).join(', plus ')
    case 'conditional_multiplier':
      return `${feeExprText(expr.of, labels)}, ${factorText(expr.factor)} ${conditionText(expr.when, labels)}`
  }
}

export function feeLineText(line: FeeScheduleBody['lines'][number], labels: FieldLabels): string {
  if (line.expr.op === 'flat' && line.expr.cents === 0) return `${line.label}: no charge.`
  return `${line.label}: ${feeExprText(line.expr, labels)}. ${FEE_STAGE_TEXT[line.due]}.`
}
