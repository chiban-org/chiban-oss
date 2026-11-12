import { createHash, randomBytes } from 'node:crypto'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { boardPacketLinks, type boardPackets } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { linkPacketMail } from '@/features/boards/packetMail'
import { packetPlace } from '@/features/boards/packetView'
import { loadPacketWording } from '@/features/boards/packetWording'
import type { MailTransport } from '@/features/mail/transport'
import { err, ok, type Result } from '@/types/result'

const TOKEN_BYTES = 32
const DAY_MS = 24 * 60 * 60 * 1000

export function hashPacketToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export interface IssueContext {
  actor: Actor
  packet: typeof boardPackets.$inferSelect
  now: Date
  signal: AbortSignal
}

export async function issuePacketLink(
  db: Db,
  mail: MailTransport,
  context: IssueContext,
  recipient: { recipientName: string; recipientEmail: string; days: number },
): Promise<Result<string, 'send_failed'>> {
  const { actor, packet, now, signal } = context
  const email = recipient.recipientEmail.trim().toLowerCase()
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const [created] = await db
    .insert(boardPacketLinks)
    .values({
      packetId: packet.id,
      recipientName: recipient.recipientName,
      recipientEmail: email,
      tokenHash: hashPacketToken(token),
      expiresAt: new Date(now.getTime() + recipient.days * DAY_MS),
      createdBy: actor.userId,
      createdAt: now,
    })
    .returning({ id: boardPacketLinks.id })
  const linkId = created?.id ?? ''
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'packet.link.send',
      entityType: 'board_packet',
      entityId: packet.id,
      after: { linkId, recipientEmail: email },
    },
    signal,
  )
  const place = await packetPlace(db, packet.meetingId)
  const wording = await loadPacketWording(db, packet.boardId, signal)
  const sent = await mail.send(
    linkPacketMail(
      { name: recipient.recipientName, email },
      { ...packet, place },
      {
        url: `${env.BASE_URL}/board/packets/${token}`,
        days: recipient.days,
      },
      wording,
    ),
    signal,
  )
  return sent.ok ? ok(linkId) : err('send_failed')
}
