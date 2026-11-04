import type { Role } from '@/constants/roles'
import type { MailMessage } from '@/features/mail/transport'
import { roleLabel } from '@/features/staffNav/roleLabels'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

interface Draft {
  to: string
  subject: string
  lines: string[]
  link: string
  linkText: string
}

function message({ to, subject, lines, link, linkText }: Draft): MailMessage {
  const html = `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}<p><a href="${escapeHtml(link)}">${escapeHtml(linkText)}</a></p>`
  return { to, subject, text: `${lines.join('\n\n')}\n\n${link}\n`, html }
}

export function inviteMessage(
  input: { email: string; displayName: string; roles: readonly Role[] },
  link: string,
): MailMessage {
  const roles = input.roles.map(roleLabel).join(', ')
  return message({
    to: input.email,
    subject: 'Set up your staff account',
    lines: [
      `Hello ${input.displayName},`,
      `An administrator created a staff account for you (${roles}). Use this link to choose your password. It works once and expires in 7 days.`,
      'If the link has expired, ask an administrator to send a new invitation.',
    ],
    link,
    linkText: 'Choose your password',
  })
}

export function resetMessage(
  input: { email: string; displayName: string },
  link: string,
): MailMessage {
  return message({
    to: input.email,
    subject: 'Reset your password',
    lines: [
      `Hello ${input.displayName},`,
      'An administrator sent you a link to set a new password. It works once and expires in 24 hours. Your current password keeps working until you use it.',
      'If you did not expect this, tell your administrator.',
    ],
    link,
    linkText: 'Set a new password',
  })
}
