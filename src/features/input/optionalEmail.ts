import { z } from 'zod'
import { trimmed } from './field'
import { emailAddress } from './text'

export function optionalEmail(noun: string) {
  const email = emailAddress(noun)
  return z
    .unknown()
    .optional()
    .transform((raw, ctx): string | null => {
      if (trimmed(raw) === '') return null
      const parsed = email.safeParse(raw)
      if (parsed.success) return parsed.data
      for (const issue of parsed.error.issues)
        ctx.addIssue({ code: 'custom', message: issue.message })
      return z.NEVER
    })
}
