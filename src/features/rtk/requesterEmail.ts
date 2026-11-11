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

export function releaseLetterNoteFor(contact: string | null): string {
  const email = requesterEmailOf(contact)
  const otherwise =
    email === null
      ? 'print the release letter from Letters and send it'
      : `the release letter is emailed to ${email}`
  return `By email, the letter goes with the records. For inspection or a paper copy, ${otherwise}.`
}

export function letterNoteFor(contact: string | null): string {
  const email = requesterEmailOf(contact)
  return email === null
    ? 'There is no email address on this request, so print the letter from Letters and send it.'
    : `The letter will be emailed to ${email}.`
}
