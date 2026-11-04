import { z } from 'zod'
import { TemplateDocSchema } from '@/features/templates/doc/docSchema'

export const TEMPLATE_KINDS = [
  'permit',
  'placard',
  'letter',
  'hearing_notice',
  'notice_of_decision',
  'decision_letter',
  'agenda',
  'enforcement_order',
  'rtk_response',
  'counsel_packet_cover',
  'receipt',
  'certificate',
  'board_packet_cover',
  'trc_summary',
] as const
export type TemplateKind = (typeof TEMPLATE_KINDS)[number]

const common = {
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(TEMPLATE_KINDS),
}

export const TextTemplateBodySchema = z.object({
  ...common,
  format: z.literal('text').optional(),
  body: z.string().min(1),
})
export type TextTemplateBody = z.infer<typeof TextTemplateBodySchema>

export const DocTemplateBodySchema = z.object({
  ...common,
  format: z.literal('doc'),
  doc: TemplateDocSchema,
})
export type DocTemplateBody = z.infer<typeof DocTemplateBodySchema>

export const TemplateBodySchema = z.union([DocTemplateBodySchema, TextTemplateBodySchema])
export type TemplateBody = z.infer<typeof TemplateBodySchema>

export function isDocTemplate(template: TemplateBody): template is DocTemplateBody {
  return template.format === 'doc'
}
