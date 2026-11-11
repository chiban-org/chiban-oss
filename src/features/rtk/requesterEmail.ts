import { z } from 'zod'

const EMAIL_LIKE = /[^\s,;<>()]+@[^\s,;<>()]+\.[^\s,;<>()]*[a-z0-9]/gi
const emailSchema = z.string().email().max(320)

export function requesterEmailOf(contact: string | null): string | null {
  const found = (contact ?? '').match(EMAIL_LIKE) ?? []
  const valid = [...new Set(found.map((m) => m.toLowerCase()))].filter(
    (m) => emailSchema.safeParse(m).success,
  )
  return valid.length === 1 ? (valid[0] ?? null) : null
}
