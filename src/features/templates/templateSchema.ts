import { z } from 'zod'

export const TemplateBodySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['permit', 'placard', 'letter']),
  body: z.string().min(1),
})
export type TemplateBody = z.infer<typeof TemplateBodySchema>
