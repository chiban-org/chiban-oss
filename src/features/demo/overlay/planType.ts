import { isDeepStrictEqual } from 'node:util'
import { joinPath, type OverlayIssue, zodIssues } from '@/features/demo/overlay/overlayIssue'
import type { OverlayNoticeFees, OverlayType } from '@/features/demo/overlay/overlaySchema'
import { exprFieldRefs, type FeeExpr, type FeeScheduleBody } from '@/features/fees/feeSchema'
import { conditionFields } from '@/features/forms/condition'
import { type FormBody, FormBodySchema, isNumberType } from '@/features/forms/formSchema'
import { err, ok, type Result } from '@/types/result'

type FeeLine = FeeScheduleBody['lines'][number]

export const NOTICE_MAIL_CODE = 'notice_mail'
export const NOTICE_NEWSPAPER_CODE = 'notice_newspaper'

export interface PlanTypeInput {
  typeKey: string
  entry: OverlayType | undefined
  form: FormBody
  fee: FeeScheduleBody
  noticeFees: OverlayNoticeFees | undefined
}

export interface TypePlan {
  form: FormBody | null
  fee: FeeScheduleBody | null
}

function noticeLines(fees: OverlayNoticeFees | undefined): Map<string, FeeLine> {
  const lines = new Map<string, FeeLine>()
  if (fees?.perAbutterCents !== undefined) {
    lines.set(NOTICE_MAIL_CODE, {
      code: NOTICE_MAIL_CODE,
      label: 'Mailed notice to abutters',
      due: 'at_notice',
      expr: {
        op: 'per_unit',
        source: { kind: 'count_of', what: 'abutters_on_issued_list' },
        centsPerUnit: fees.perAbutterCents,
      },
    })
  }
  if (fees?.advertisingCents !== undefined) {
    lines.set(NOTICE_NEWSPAPER_CODE, {
      code: NOTICE_NEWSPAPER_CODE,
      label: 'Published notice',
      due: 'at_notice',
      expr: { op: 'flat', cents: fees.advertisingCents },
    })
  }
  return lines
}

function exprConditionFields(expr: FeeExpr): string[] {
  switch (expr.op) {
    case 'conditional_multiplier':
      return [...conditionFields(expr.when), ...exprConditionFields(expr.of)]
    case 'minimum':
      return exprConditionFields(expr.of)
    case 'sum':
      return expr.of.flatMap(exprConditionFields)
    case 'flat':
    case 'per_unit':
    case 'tiered':
      return []
  }
}

function planForm(input: PlanTypeInput, base: string): Result<FormBody | null, OverlayIssue[]> {
  const added = input.entry?.formFields
  if (added === undefined) return ok(null)
  const known = new Map(input.form.fields.map((f) => [f.key, f]))
  const clashes = added.flatMap((field, i) => {
    const existing = known.get(field.key)
    return existing === undefined || isDeepStrictEqual(existing, field)
      ? []
      : [
          {
            path: joinPath(base, 'formFields', i, 'key'),
            message: `the form already has ${field.key}`,
          },
        ]
  })
  if (clashes.length > 0) return err(clashes)
  const fresh = added.filter((field) => !known.has(field.key))
  if (fresh.length === 0) return ok(null)
  const body = { ...input.form, fields: [...input.form.fields, ...fresh] }
  const parsed = FormBodySchema.safeParse(body)
  if (!parsed.success) return err(zodIssues(joinPath(base, 'form'), parsed.error.issues))
  return ok(parsed.data)
}

function upsertLines(input: PlanTypeInput, base: string): Result<FeeLine[], OverlayIssue[]> {
  const lines = new Map(input.fee.lines.map((l) => [l.code, l]))
  for (const [code, line] of noticeLines(input.noticeFees)) {
    const existing = lines.get(code)
    lines.set(code, existing === undefined ? line : { ...existing, expr: line.expr })
  }
  const issues: OverlayIssue[] = []
  for (const [code, line] of Object.entries(input.entry?.fees ?? {})) {
    const existing = lines.get(code)
    const label = line.label ?? existing?.label
    const due = line.due ?? existing?.due
    if (label === undefined || due === undefined) {
      issues.push({
        path: joinPath(base, 'fees', code),
        message: `${input.fee.key} has no line ${code} (it has ${[...lines.keys()].join(', ')}); give label and due to add one`,
      })
      continue
    }
    lines.set(code, { code, label, due, expr: line.expr })
  }
  return issues.length > 0 ? err(issues) : ok([...lines.values()])
}

function fieldIssues(input: PlanTypeInput, form: FormBody, base: string): OverlayIssue[] {
  const numeric = new Set(form.fields.filter((f) => isNumberType(f.type)).map((f) => f.key))
  const all = new Set(form.fields.map((f) => f.key))
  return Object.entries(input.entry?.fees ?? {}).flatMap(([code, line]) => {
    const path = joinPath(base, 'fees', code, 'expr')
    const notNumeric = exprFieldRefs(line.expr).filter((r) => !numeric.has(r))
    const missing = exprConditionFields(line.expr).filter((r) => !all.has(r))
    return [
      ...notNumeric.map((r) => ({ path, message: `${r} is not a number field on ${form.key}` })),
      ...missing.map((r) => ({ path, message: `${r} is not a field on ${form.key}` })),
    ]
  })
}

export function planType(input: PlanTypeInput): Result<TypePlan, OverlayIssue[]> {
  const base = joinPath('applicationTypes', input.typeKey)
  const form = planForm(input, base)
  if (!form.ok) return form
  const lines = upsertLines(input, base)
  if (!lines.ok) return lines
  const refIssues = fieldIssues(input, form.value ?? input.form, base)
  if (refIssues.length > 0) return err(refIssues)
  const fee = { ...input.fee, lines: lines.value }
  const feeChanged = !isDeepStrictEqual(fee, input.fee)
  return ok({ form: form.value, fee: feeChanged ? fee : null })
}
