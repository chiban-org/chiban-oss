import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  boardPacketItems,
  boardPacketLinks,
  boardPacketMembers,
  boardPackets,
  users,
} from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { changeCount, changeSummary, pendingChanges } from '@/features/boards/packetChanges'
import { packetItemRows } from '@/features/boards/packetContents'
import { updatePacketMail } from '@/features/boards/packetMail'
import { type PacketRow, type SendError, sendablePacket } from '@/features/boards/packetSend'
import type { MailTransport } from '@/features/mail/transport'
import { err, ok, type Result } from '@/types/result'

export { agendaReplacement, replacePacketAgenda } from '@/features/boards/packetAgenda'

async function updateRecipients(db: Db, packetId: string, now: Date) {
  const members = await db
    .select({ email: users.email })
    .from(boardPacketMembers)
    .innerJoin(users, eq(users.id, boardPacketMembers.userId))
    .where(eq(boardPacketMembers.packetId, packetId))
  const links = await db
    .select({ email: boardPacketLinks.recipientEmail })
    .from(boardPacketLinks)
    .where(
      and(
        eq(boardPacketLinks.packetId, packetId),
        isNull(boardPacketLinks.revokedAt),
        gt(boardPacketLinks.expiresAt, now),
      ),
    )
  return [
    ...members.map((m) => ({ email: m.email, viaLink: false })),
    ...links.map((l) => ({ email: l.email, viaLink: true })),
  ]
}

async function markUpdateSent(db: Db, packet: PacketRow, now: Date): Promise<void> {
  await db
    .update(boardPacketItems)
    .set({ sentAt: now })
    .where(
      and(
        eq(boardPacketItems.packetId, packet.id),
        isNull(boardPacketItems.sentAt),
        isNull(boardPacketItems.removedAt),
      ),
    )
  await db.update(boardPackets).set({ lastSentAt: now }).where(eq(boardPackets.id, packet.id))
  await db
    .update(boardPacketMembers)
    .set({ lastSentAt: now })
    .where(eq(boardPacketMembers.packetId, packet.id))
}

export async function sendPacketUpdate(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  input: { packetId: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ recipients: number }, SendError | 'not_sent' | 'no_changes'>> {
  const found = await sendablePacket(db, actor, input.packetId, signal)
  if (!found.ok) return found
  const packet = found.value
  if (packet.sentAt === null) return err('not_sent')
  const changes = pendingChanges(await packetItemRows(db, packet.id), packet)
  if (changeCount(changes) === 0) return err('no_changes')
  const summary = `${changeSummary(changes)}.`
  const recipients = await updateRecipients(db, packet.id, now)
  for (const recipient of recipients) {
    const sent = await mail.send(
      updatePacketMail(recipient.email, packet, { summary, viaLink: recipient.viaLink }),
      signal,
    )
    if (!sent.ok) return err('send_failed')
  }
  await markUpdateSent(db, packet, now)
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'packet.update.send',
      entityType: 'board_packet',
      entityId: packet.id,
      after: { summary },
    },
    signal,
  )
  return ok({ recipients: recipients.length })
}
