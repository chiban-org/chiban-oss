import { z } from 'zod'
import { type Condition, ConditionSchema } from '@/features/forms/condition'

export type FeeSource =
  | { kind: 'field'; field: string }
  | { kind: 'count_of'; what: 'abutters_on_issued_list' | 'dwelling_units' }

export interface FeeTier {
  upTo: number | null
  centsPerUnit?: number
  flatCents?: number
}

export type FeeExpr =
  | { op: 'flat'; cents: number }
  | { op: 'per_unit'; source: FeeSource; centsPerUnit: number }
  | { op: 'minimum'; cents: number; of: FeeExpr }
  | { op: 'tiered'; source: FeeSource; mode: 'graduated' | 'bracket'; tiers: FeeTier[] }
  | { op: 'sum'; of: FeeExpr[] }
  | { op: 'conditional_multiplier'; when: Condition; factor: number; of: FeeExpr }

export const FeeSourceSchema: z.ZodType<FeeSource> = z.union([
  z.object({ kind: z.literal('field'), field: z.string().min(1) }),
  z.object({
    kind: z.literal('count_of'),
    what: z.enum(['abutters_on_issued_list', 'dwelling_units']),
  }),
])

export const MAX_FEE_CENTS = 100_000_000
export const MAX_FEE_MULTIPLIER = 100

const cents = z.number().int().nonnegative().max(MAX_FEE_CENTS)
const centsPerUnit = z.number().nonnegative().max(MAX_FEE_CENTS)

export const FeeExprSchema: z.ZodType<FeeExpr> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal('flat'), cents }),
    z.object({
      op: z.literal('per_unit'),
      source: FeeSourceSchema,
      centsPerUnit,
    }),
    z.object({ op: z.literal('minimum'), cents, of: FeeExprSchema }),
    z.object({
      op: z.literal('tiered'),
      source: FeeSourceSchema,
      mode: z.enum(['graduated', 'bracket']),
      tiers: z
        .array(
          z.object({
            upTo: z.number().positive().nullable(),
            centsPerUnit: centsPerUnit.optional(),
            flatCents: cents.optional(),
          }),
        )
        .min(1),
    }),
    z.object({ op: z.literal('sum'), of: z.array(FeeExprSchema).min(1) }),
    z.object({
      op: z.literal('conditional_multiplier'),
      when: ConditionSchema,
      factor: z.number().positive().max(MAX_FEE_MULTIPLIER),
      of: FeeExprSchema,
    }),
  ]),
)

export const FEE_STAGES = ['at_intake', 'at_approval', 'at_renewal', 'at_notice'] as const
export type FeeStage = (typeof FEE_STAGES)[number]

export const FeeScheduleBodySchema = z
  .object({
    key: z.string().min(1),
    label: z.string().optional(),
    lines: z
      .array(
        z.object({
          code: z.string().trim().min(1),
          label: z.string().trim().min(1),
          expr: FeeExprSchema,
          due: z.enum(FEE_STAGES),
        }),
      )
      .min(1),
  })
  .superRefine((body, ctx) => {
    const codes = new Set<string>()
    body.lines.forEach((line, i) => {
      if (codes.has(line.code)) {
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'code'], message: 'duplicate fee code' })
      }
      codes.add(line.code)
    })
  })
export type FeeScheduleBody = z.infer<typeof FeeScheduleBodySchema>

export function exprFieldRefs(expr: FeeExpr): string[] {
  switch (expr.op) {
    case 'flat':
      return []
    case 'per_unit':
    case 'tiered':
      return expr.source.kind === 'field' ? [expr.source.field] : []
    case 'minimum':
    case 'conditional_multiplier':
      return exprFieldRefs(expr.of)
    case 'sum':
      return expr.of.flatMap(exprFieldRefs)
  }
}
