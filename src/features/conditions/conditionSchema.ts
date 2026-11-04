import { z } from 'zod'

export const ConditionLibraryBodySchema = z
  .object({
    key: z.string().min(1),
    label: z.string().optional(),
    conditions: z
      .array(
        z.object({
          code: z.string().min(1),
          text: z.string().min(1),
          blocksIssuance: z.boolean(),
        }),
      )
      .min(1),
  })
  .superRefine((body, ctx) => {
    const codes = new Set<string>()
    body.conditions.forEach((c, i) => {
      if (codes.has(c.code)) {
        ctx.addIssue({ code: 'custom', path: ['conditions', i, 'code'], message: 'duplicate code' })
      }
      codes.add(c.code)
    })
  })
export type ConditionLibraryBody = z.infer<typeof ConditionLibraryBodySchema>
