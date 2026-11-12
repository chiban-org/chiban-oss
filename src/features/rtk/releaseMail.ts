import { createHash, randomBytes } from 'node:crypto'
import { env } from '@/config/env'
import type { DbOrTx } from '@/db/client'
import type { MailAttachment, MailTransport } from '@/features/mail/transport'
import { publishedWording, townName } from '@/features/notifications/messageSettings'
import { releaseValues, wordingLink } from '@/features/notifications/wording/externalValues'
import { type RenderedMessage, renderWording } from '@/features/notifications/wording/renderWording'
import { wordingFor } from '@/features/notifications/wording/wordingEdits'

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

async function sendRendered(
  mail: MailTransport,
  message: ReleaseMail,
  rendered: RenderedMessage,
  signal: AbortSignal,
): Promise<boolean> {
  const sent = await mail.send(
    {
      to: message.to.trim().toLowerCase(),
      ...rendered,
      ...(message.attachments.length === 0 ? {} : { attachments: message.attachments }),
    },
    signal,
  )
  return sent.ok
}

async function loadSettings(db: DbOrTx, signal: AbortSignal) {
  const [name, overrides] = await Promise.all([townName(db, signal), publishedWording(db, signal)])
  return { name, overrides }
}

export async function sendReleaseLink(
  db: DbOrTx,
  mail: MailTransport,
  message: ReleaseMail & { token: string; tooLarge?: boolean; reissued?: boolean },
  signal: AbortSignal,
): Promise<boolean> {
  const { name, overrides } = await loadSettings(db, signal)
  const rendered = renderWording(
    wordingFor('rtk_records_link', overrides),
    { ...releaseValues(message, LINK_DAYS), 'town.name': name },
    wordingLink('rtk_records_link', `${env.BASE_URL}/records/releases/${message.token}`),
  )
  return await sendRendered(mail, message, rendered, signal)
}

export async function sendReleaseFiles(
  db: DbOrTx,
  mail: MailTransport,
  message: ReleaseMail,
  signal: AbortSignal,
): Promise<boolean> {
  const { name, overrides } = await loadSettings(db, signal)
  const rendered = renderWording(
    wordingFor('rtk_records_attached', overrides),
    { ...releaseValues(message, LINK_DAYS), 'town.name': name },
    null,
  )
  return await sendRendered(mail, message, rendered, signal)
}
