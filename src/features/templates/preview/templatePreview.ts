import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { PdfBlock } from '@/features/pdf/pdfSpec'
import { previewSource } from '@/features/templates/preview/previewSources'
import type { SampleRecord } from '@/features/templates/preview/previewTypes'
import { renderDocument, withFrameFields } from '@/features/templates/templateBlocks'
import {
  TEMPLATE_KINDS,
  TemplateBodySchema,
  type TemplateKind,
} from '@/features/templates/templateSchema'
import { err, ok, type Result } from '@/types/result'

export interface TemplatePreview {
  values: Record<string, string>
  locked: Record<string, string>
  sections: Record<string, PdfBlock[]>
  conditions: string[]
  pdfBase64: string
}

export type SamplesResult = { ok: true; samples: SampleRecord[] } | { ok: false; error: string }
export type PreviewResult = { ok: true; preview: TemplatePreview } | { ok: false; error: string }

export type PreviewError = 'forbidden' | 'invalid_input' | 'not_found' | 'unknown_fields'

export function asTemplateKind(value: string): TemplateKind | null {
  return TEMPLATE_KINDS.find((k) => k === value) ?? null
}

export async function listTemplateSamples(
  db: DbOrTx,
  actor: Actor,
  kind: TemplateKind,
  signal: AbortSignal,
): Promise<Result<SampleRecord[], 'forbidden'>> {
  if (!(await hasCapability(db, actor.userId, 'config.edit', signal))) return err('forbidden')
  const source = previewSource(kind)
  return ok(source === null ? [] : await source.samples({ db, actor, signal }))
}

function stringValues(values: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])),
  )
}

export async function previewTemplate(
  db: DbOrTx,
  actor: Actor,
  input: { body: unknown; recordId: string },
  signal: AbortSignal,
): Promise<Result<TemplatePreview, PreviewError>> {
  if (!(await hasCapability(db, actor.userId, 'config.edit', signal))) return err('forbidden')
  const parsed = TemplateBodySchema.safeParse(input.body)
  if (!parsed.success) return err('invalid_input')
  const template = parsed.data
  const source = previewSource(template.kind)
  const record = source === null ? null : await source.input({ db, actor, signal }, input.recordId)
  if (record === null) return err('not_found')
  const pdf = await renderDocument(template.kind, template, record)
  if (!pdf.ok) return err('unknown_fields')
  const context = withFrameFields(record)
  return ok({
    values: stringValues(context.values),
    locked: Object.fromEntries(context.locked ?? []),
    sections: Object.fromEntries(context.sections ?? []),
    conditions: [...(context.conditions ?? [])],
    pdfBase64: Buffer.from(pdf.value).toString('base64'),
  })
}
