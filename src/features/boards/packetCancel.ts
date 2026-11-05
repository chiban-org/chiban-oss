import type { Board } from '@packs/nh/schema'
import { and, desc, eq, gt, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import {
  auditLog,
  boardMeetings,
  boardPacketLinks,
  boardPacketMembers,
  boardPackets,
  users,
} from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { cancelledPacketMail } from '@/features/boards/packetMail'
import { stillSeated } from '@/features/boards/packetSend'
import type { MailTransport } from '@/features/mail/transport'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export async function closeMeetingPacket(tx: Tx, meetingId: string): Promise<void> {
  const packets = tx
    .select({ id: boardPackets.id })
    .from(boardPackets)
    .where(eq(boardPackets.meetingId, meetingId))
  await tx
    .update(boardPacketLinks)
    .set({ revokedAt: sql`now()` })
    .where(and(inArray(boardPacketLinks.packetId, packets), isNull(boardPacketLinks.revokedAt)))
}

async function cancelledRecipients(
  db: Db,
  packet: { id: string; board: Board },
  cancelledAt: Date,
) {
  const packetId = packet.id
  const members = await db
    .select({ email: users.email })
    .from(boardPacketMembers)
    .innerJoin(users, eq(users.id, boardPacketMembers.userId))
    .where(and(eq(boardPacketMembers.packetId, packetId), stillSeated(packet.board)))
  const links = await db
    .select({ email: boardPacketLinks.recipientEmail })
    .from(boardPacketLinks)
    .where(
      and(
        eq(boardPacketLinks.packetId, packetId),
        gt(boardPacketLinks.expiresAt, cancelledAt),
        or(isNull(boardPacketLinks.revokedAt), gte(boardPacketLinks.revokedAt, cancelledAt)),
      ),
    )
  return [...new Set([...members, ...links].map((r) => r.email))]
}

export async function tellPacketRecipientsCancelled(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  input: { meetingId: string },
  signal: AbortSignal,
): Promise<Result<{ told: number }, 'forbidden' | 'not_found' | 'not_cancelled' | 'send_failed'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'packet.manage', signal))) return err('forbidden')
  if (!isUuid(input.meetingId)) return err('not_found')
  const [row] = await db
    .select({ packet: boardPackets, meeting: boardMeetings })
    .from(boardPackets)
    .innerJoin(boardMeetings, eq(boardMeetings.id, boardPackets.meetingId))
    .where(eq(boardPackets.meetingId, input.meetingId))
  if (row === undefined) return err('not_found')
  if (row.meeting.status !== 'cancelled') return err('not_cancelled')
  const [cancel] = await db
    .select({ at: auditLog.at })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'board.meeting.cancel'), eq(auditLog.entityId, input.meetingId)))
    .orderBy(desc(auditLog.at))
    .limit(1)
  const cancelledAt = cancel?.at ?? new Date()
  const recipients = await cancelledRecipients(db, row.packet, cancelledAt)
  const reason = row.meeting.cancelReason ?? 'no reason given'
  for (const email of recipients) {
    const sent = await mail.send(cancelledPacketMail(email, row.packet, reason), signal)
    if (!sent.ok) return err('send_failed')
  }
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'packet.cancel.notify',
      entityType: 'board_packet',
      entityId: row.packet.id,
      after: { told: recipients.length },
    },
    signal,
  )
  return ok({ told: recipients.length })
}
