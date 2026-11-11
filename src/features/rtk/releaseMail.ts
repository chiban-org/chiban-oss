import { createHash, randomBytes } from 'node:crypto'
import { env } from '@/config/env'
import type { MailAttachment, MailTransport } from '@/features/mail/transport'
import { formatCivilDate } from '@/lib/formatDate'

const TOKEN_BYTES = 32
const DAY_MS = 24 * 60 * 60 * 1000
export const LINK_DAYS = 30
export const MAX_ATTACHED_BYTES = 10 * 1024 * 1024

export function hashReleaseToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export interface ReleaseLink {
  token: string
  hash: string
  expiresAt: Date
}

export function mintReleaseLink(now: Date): ReleaseLink {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return {
    token,
    hash: hashReleaseToken(token),
    expiresAt: new Date(now.getTime() + LINK_DAYS * DAY_MS),
  }
}

export interface ReleaseMail {
  to: string
  number: string
  releasedOn: string
  attachments: MailAttachment[]
}

async function sendParagraphs(
  mail: MailTransport,
  message: ReleaseMail,
  paragraphs: { text: string; html: string }[],
  signal: AbortSignal,
): Promise<boolean> {
  const sent = await mail.send(
    {
      to: message.to.trim().toLowerCase(),
      subject: `Records for request ${message.number}`,
      text: `${paragraphs.map((p) => p.text).join('\n\n')}\n`,
      html: paragraphs.map((p) => `<p>${p.html}</p>`).join(''),
      ...(message.attachments.length === 0 ? {} : { attachments: message.attachments }),
    },
    signal,
  )
  return sent.ok
}

function releasedLine(message: ReleaseMail): string {
  return `The town released records for your Right-to-Know request ${message.number} on ${formatCivilDate(message.releasedOn)}.`
}

function linkNote(message: { tooLarge?: boolean; reissued?: boolean }): string {
  if (message.reissued === true) return ' The earlier link has expired, so here is a new one.'
  return message.tooLarge === true
    ? ' The files were too large to attach to an email, so they are at this link instead.'
    : ''
}

export async function sendReleaseLink(
  mail: MailTransport,
  message: ReleaseMail & { token: string; tooLarge?: boolean; reissued?: boolean },
  signal: AbortSignal,
): Promise<boolean> {
  const link = `${env.BASE_URL}/records/releases/${message.token}`
  const lead = `${releasedLine(message)}${linkNote(message)} The link works for ${LINK_DAYS} days.`
  return await sendParagraphs(
    mail,
    message,
    [
      { text: lead, html: lead },
      { text: link, html: `<a href="${link}">Open the records</a>` },
    ],
    signal,
  )
}

export async function sendReleaseFiles(
  mail: MailTransport,
  message: ReleaseMail,
  signal: AbortSignal,
): Promise<boolean> {
  const lead = `${releasedLine(message)} The records and the town's letter are attached.`
  return await sendParagraphs(mail, message, [{ text: lead, html: lead }], signal)
}
