import {
  isMergeField,
  type MergeField,
  scanTokens,
  unknownMergeFields,
} from '@/features/templates/mergeFields'
import { err, ok, type Result } from '@/types/result'

export type MergeContext = Partial<Record<MergeField, string | null>>

export const NOT_RECORDED = 'Not recorded'

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

export function renderTemplate(
  body: string,
  ctx: MergeContext,
): Result<string, { unknownFields: string[] }> {
  const unknownFields = unknownMergeFields(body)
  if (unknownFields.length > 0) return err({ unknownFields })
  let out = ''
  let cursor = 0
  for (const token of scanTokens(body)) {
    out += body.slice(cursor, token.start)
    const value = isMergeField(token.name) ? ctx[token.name] : null
    out += value === undefined || value === null || value === '' ? NOT_RECORDED : escapeHtml(value)
    cursor = token.end
  }
  return ok(out + body.slice(cursor))
}
