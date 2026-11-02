import { z } from 'zod'

export const ChecklistBodySchema = z.object({
  key: z.string().min(1),
  inspectionType: z.string().min(1),
  label: z.string().min(1),
  final: z.boolean().optional(),
  items: z
    .array(z.object({ key: z.string().min(1), label: z.string().min(1), required: z.boolean() }))
    .min(1),
})
export type ChecklistBody = z.infer<typeof ChecklistBodySchema>

export function isFinalChecklist(body: {
  final?: boolean | undefined
  inspectionType: string
}): boolean {
  return body.final ?? body.inspectionType === 'final'
}
