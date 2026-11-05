import type { Board } from '@packs/nh/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import {
  boardMeetings,
  boardMemberships,
  boardPacketItems,
  boardPacketLinks,
  boardPacketMembers,
  boardPackets,
  users,
} from '@/db/schema'
import { activeMembershipOn } from '@/features/access/predicates'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { issuePacketLink } from '@/features/boards/packetLinkIssue'
import { memberPacketMail } from '@/features/boards/packetMail'
import type { MailTransport } from '@/features/mail/transport'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export type PacketRow = typeof boardPackets.$inferSelect

export type SendError =
  | 'forbidden'
  | 'not_found'
  | 'meeting_cancelled'
  | 'no_members'
  | 'already_sent'
  | 'send_failed'

const DAY_MS = 24 * 60 * 60 * 1000

export async function sendablePacket(
  db: Db,
  actor: Actor,
  packetId: string,
  signal: AbortSignal,
): Promise<Result<PacketRow, 'forbidden' | 'not_found' | 'meeting_cancelled'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'packet.manage', signal))) return err('forbidden')
  if (!isUuid(packetId)) return err('not_found')
  const [row] = await db
    .select({ packet: boardPackets, status: boardMeetings.status })
    .from(boardPackets)
    .leftJoin(boardMeetings, eq(boardMeetings.id, boardPackets.meetingId))
    .where(eq(boardPackets.id, packetId))
  if (row === undefined) return err('not_found')
  return row.status === 'cancelled' ? err('meeting_cancelled') : ok(row.packet)
}

export async function stampSent(db: DbOrTx, packet: PacketRow, now: Date): Promise<void> {
  if (packet.sentAt !== null) return
  await db
    .update(boardPackets)
    .set({ sentAt: now, lastSentAt: now })
    .where(eq(boardPackets.id, packet.id))
  await db
    .update(boardPacketItems)
    .set({ sentAt: now })
    .where(and(eq(boardPacketItems.packetId, packet.id), isNull(boardPacketItems.sentAt)))
}

export async function boardMembersOf(db: DbOrTx, board: Board) {
  return await db
    .selectDistinct({ userId: users.id, email: users.email, name: users.displayName })
    .from(boardMemberships)
    .innerJoin(users, eq(users.id, boardMemberships.userId))
    .where(
      and(
        eq(boardMemberships.board, board),
        eq(users.isActive, true),
        activeMembershipOn(sql`${boardMemberships.userId}`, sql`${board}`),
      ),
    )
    .orderBy(users.displayName)
}

export async function sendPacketToBoard(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  input: { packetId: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ sent: number }, SendError>> {
  const found = await sendablePacket(db, actor, input.packetId, signal)
  if (!found.ok) return found
  const packet = found.value
  const members = await boardMembersOf(db, packet.board)
  if (members.length === 0) return err('no_members')
  const already = await db
    .select({ userId: boardPacketMembers.userId })
    .from(boardPacketMembers)
    .where(eq(boardPacketMembers.packetId, packet.id))
  const sentTo = new Set(already.map((a) => a.userId))
  const due = members.filter((m) => !sentTo.has(m.userId))
  if (due.length === 0) return err('already_sent')
  await stampSent(db, packet, now)
  for (const member of due) {
    const sent = await mail.send(memberPacketMail(member.email, packet), signal)
    if (!sent.ok) return err('send_failed')
    await db
      .insert(boardPacketMembers)
      .values({ packetId: packet.id, userId: member.userId, sentAt: now, lastSentAt: now })
  }
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'packet.board.send',
      entityType: 'board_packet',
      entityId: packet.id,
      after: { userIds: due.map((m) => m.userId) },
    },
    signal,
  )
  return ok({ sent: due.length })
}

export async function resendToMember(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  input: { packetId: string; userId: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, SendError>> {
  const found = await sendablePacket(db, actor, input.packetId, signal)
  if (!found.ok) return found
  if (!isUuid(input.userId)) return err('not_found')
  const [member] = await db
    .select({ email: users.email })
    .from(boardPacketMembers)
    .innerJoin(users, eq(users.id, boardPacketMembers.userId))
    .where(
      and(
        eq(boardPacketMembers.packetId, input.packetId),
        eq(boardPacketMembers.userId, input.userId),
      ),
    )
  if (member === undefined) return err('not_found')
  const sent = await mail.send(memberPacketMail(member.email, found.value), signal)
  if (!sent.ok) return err('send_failed')
  await db
    .update(boardPacketMembers)
    .set({ lastSentAt: now })
    .where(
      and(
        eq(boardPacketMembers.packetId, input.packetId),
        eq(boardPacketMembers.userId, input.userId),
      ),
    )
  return ok(undefined)
}

export async function resendToLink(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  input: { linkId: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ linkId: string }, SendError>> {
  if (!isUuid(input.linkId)) return err('not_found')
  const [old] = await db
    .select()
    .from(boardPacketLinks)
    .where(eq(boardPacketLinks.id, input.linkId))
  if (old === undefined || old.revokedAt !== null) return err('not_found')
  const found = await sendablePacket(db, actor, old.packetId, signal)
  if (!found.ok) return found
  const days = Math.max(1, Math.round((old.expiresAt.getTime() - old.createdAt.getTime()) / DAY_MS))
  await db.update(boardPacketLinks).set({ revokedAt: now }).where(eq(boardPacketLinks.id, old.id))
  const issued = await issuePacketLink(
    db,
    mail,
    { actor, packet: found.value, now, signal },
    { recipientName: old.recipientName, recipientEmail: old.recipientEmail, days },
  )
  return issued.ok ? ok({ linkId: issued.value }) : err('send_failed')
}
