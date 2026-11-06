import { z } from 'zod'
import type { Result } from '@/types/result'

export type FieldParse<T> = (raw: unknown) => Result<T, string>

export function inputField<T>(parse: FieldParse<T>): z.ZodType<T> {
  return z
    .unknown()
    .optional()
    .transform((raw, ctx) => {
      const parsed = parse(raw)
      if (parsed.ok) return parsed.value
      ctx.addIssue({ code: 'custom', message: parsed.error })
      return z.NEVER
    })
}

export function trimmed(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

function isBlank(raw: unknown): boolean {
  return raw === undefined || (typeof raw === 'string' && raw.trim() === '')
}

export function blankAsNull<T>(parse: FieldParse<T>): FieldParse<T | null> {
  return (raw) => (isBlank(raw) ? { ok: true, value: null } : parse(raw))
}
