import type { MailMessage } from '@/features/mail/transport'
import { claimValues, wordingLink } from '@/features/notifications/wording/externalValues'
import { renderWording } from '@/features/notifications/wording/renderWording'
import { wordingFor } from '@/features/notifications/wording/wordingEdits'
import type { WordingOverrides } from '@/features/notifications/wording/wordingSchema'

export function claimMessage(input: {
  to: string
  name: string
  role: 'contractor' | 'applicant'
  title: string
  link: string
  days: number
  townName: string
  wording: WordingOverrides
}): MailMessage {
  const rendered = renderWording(
    wordingFor('project_claim', input.wording),
    claimValues(input),
    wordingLink('project_claim', input.link),
  )
  return { to: input.to, ...rendered }
}
