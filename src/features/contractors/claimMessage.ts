import type { MailMessage } from '@/features/mail/transport'
import { escapeHtml } from '@/features/templates/renderTemplate'

const NAMED_AS = {
  contractor: 'as a contractor on a project',
  applicant: 'as the applicant on an application',
} as const

export function claimMessage(input: {
  to: string
  name: string
  role: keyof typeof NAMED_AS
  title: string
  link: string
  days: number
  townName: string
}): MailMessage {
  const opening = `${input.name}, you were named ${NAMED_AS[input.role]} at the ${input.townName}.`
  const body = `Use this link to claim the project and follow its permits. It works once and expires in ${input.days} days.`
  return {
    to: input.to,
    subject: `Claim your project in Chiban: ${input.title}`,
    text: `${opening}\n\n${body}\n\n${input.link}\n`,
    html: `<p>${escapeHtml(opening)}</p><p>${body}</p><p><a href="${escapeHtml(input.link)}">Claim the project</a></p>`,
  }
}
