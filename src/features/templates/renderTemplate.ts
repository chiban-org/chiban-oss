import {
  isMergeField,
  type MergeField,
  scanTokens,
  unknownMergeFields,
} from '@/features/templates/mergeFields'
import { err, ok, type Result } from '@/types/result'

export type MergeContext = Partial<Record<MergeField, string | null>>

export const NOT_RECORDED = 'Not recorded'

const OMITTED_WHEN_EMPTY: ReadonlySet<string> = new Set([
  'decision.conditionsSection',
  'decision.reasonsSection',
])

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)
}

function merge(
  body: string,
  ctx: MergeContext,
  format: (value: string) => string,
): Result<string, { unknownFields: string[] }> {
  const unknownFields = unknownMergeFields(body)
  if (unknownFields.length > 0) return err({ unknownFields })
  let out = ''
  let cursor = 0
  for (const token of scanTokens(body)) {
    out += body.slice(cursor, token.start)
    const value = isMergeField(token.name) ? ctx[token.name] : null
    const empty = value === undefined || value === null || value === ''
    out += empty ? (OMITTED_WHEN_EMPTY.has(token.name) ? '' : NOT_RECORDED) : format(value)
    cursor = token.end
  }
  return ok(out + body.slice(cursor))
}

export function renderTemplate(
  body: string,
  ctx: MergeContext,
): Result<string, { unknownFields: string[] }> {
  return merge(body, ctx, escapeHtml)
}

export function renderTemplateText(
  body: string,
  ctx: MergeContext,
): Result<string, { unknownFields: string[] }> {
  return merge(body, ctx, (value) => value)
}
