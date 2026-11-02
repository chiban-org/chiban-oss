import type { z } from 'zod'

export type FieldCopy = Readonly<Record<string, string>>

export function invalidFieldCopy(error: z.ZodError, copy: FieldCopy): string | null {
  for (const issue of error.issues) {
    const field = issue.path[0]
    const text = typeof field === 'string' ? copy[field] : undefined
    if (text !== undefined) return text
  }
  return null
}
