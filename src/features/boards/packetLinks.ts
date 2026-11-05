import { and, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  boardMemberships,
  boardPacketAccess,
  boardPacketLinks,
  boardPackets,
  users,
} from '@/db/schema'
import { activeMembershipOn } from '@/features/access/predicates'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { packetDocument } from '@/features/boards/packetDocument'
import { hashPacketToken, issuePacketLink } from '@/features/boards/packetLinkIssue'
import { sendablePacket, stampSent } from '@/features/boards/packetSend'
import { loadPacketView, type PacketView, townDateOf } from '@/features/boards/packetView'
import type { MailTransport } from '@/features/mail/transport'
import type { StoredObject } from '@/features/storage/delivery'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

const DEFAULT_DAYS = 14
const MAX_DAYS = 30

export { hashPacketToken }

async function isActiveMemberOf(
  db: Db,
  email: string,
  board: 'planning_board' | 'zba',
): Promise<boolean> {
  const rows = await db
    .select({ id: boardMemberships.id })
    .from(boardMemberships)
    .innerJoin(users, eq(users.id, boardMemberships.userId))
    .where(
      and(
        eq(users.email, email),
        eq(users.isActive, true),
        eq(boardMemberships.board, board),
        activeMembershipOn(sql`${boardMemberships.userId}`, sql`${board}`),
      ),
    )
    .limit(1)
  return rows.length > 0
}

export type SendLinkError =
  | 'forbidden'
  | 'expiry_too_long'
  | 'not_found'
  | 'meeting_cancelled'
  | 'member_of_board'
  | 'send_failed'

export async function sendPacketLink(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  input: {
    packetId: string
    recipientName: string
    recipientEmail: string
    expiresInDays?: number
  },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ linkId: string }, SendLinkError>> {
  const days = input.expiresInDays ?? DEFAULT_DAYS
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    const allowed = await requireCapability(db, actor.userId, 'packet.manage', signal)
    return err(allowed.ok ? 'expiry_too_long' : 'forbidden')
  }
  const found = await sendablePacket(db, actor, input.packetId, signal)
  if (!found.ok) return found
  const recipientEmail = input.recipientEmail.trim().toLowerCase()
  if (await isActiveMemberOf(db, recipientEmail, found.value.board)) return err('member_of_board')
  await stampSent(db, found.value, now)
  const issued = await issuePacketLink(
    db,
    mail,
    { actor, packet: found.value, now, signal },
    { recipientName: input.recipientName, recipientEmail, days },
  )
  return issued.ok ? ok({ linkId: issued.value }) : err('send_failed')
}

export async function revokePacketLink(
  db: Db,
  actor: Actor,
  input: { linkId: string },
  signal: AbortSignal,
): Promise<Result<{ packetId: string }, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'packet.manage', signal)
  if (!allowed.ok) return err('forbidden')
  if (!isUuid(input.linkId)) return err('not_found')
  const revoked = await db
    .update(boardPacketLinks)
    .set({ revokedAt: new Date() })
    .where(eq(boardPacketLinks.id, input.linkId))
    .returning({ packetId: boardPacketLinks.packetId })
  const [row] = revoked
  return row === undefined ? err('not_found') : ok({ packetId: row.packetId })
}

async function resolveLink(
  db: Db,
  token: string,
  now: Date,
): Promise<Result<typeof boardPacketLinks.$inferSelect, 'invalid' | 'expired'>> {
  const [link] = await db
    .select()
    .from(boardPacketLinks)
    .where(eq(boardPacketLinks.tokenHash, hashPacketToken(token)))
  if (link === undefined || link.revokedAt !== null) return err('invalid')
  if (link.expiresAt.getTime() <= now.getTime()) return err('expired')
  return ok(link)
}

export async function openPacket(
  db: Db,
  token: string,
  now: Date,
  signal: AbortSignal,
): Promise<Result<PacketView, 'invalid' | 'expired'>> {
  signal.throwIfAborted()
  const resolved = await resolveLink(db, token, now)
  if (!resolved.ok) return err(resolved.error)
  const link = resolved.value
  const view = await loadPacketView(db, link.packetId, link.expiresAt.toISOString(), signal)
  if (view === null) return err('invalid')
  await db
    .insert(boardPacketAccess)
    .values({ linkId: link.id, packetId: link.packetId, versionId: null, accessedAt: now })
  return ok(view)
}

export type PacketVersionError = 'invalid' | 'expired' | 'not_found' | { withdrawnOn: CivilDate }

export async function openPacketVersion(
  db: Db,
  token: string,
  versionId: string,
  now: Date,
  signal: AbortSignal,
): Promise<Result<StoredObject, PacketVersionError>> {
  signal.throwIfAborted()
  const resolved = await resolveLink(db, token, now)
  if (!resolved.ok) return err(resolved.error)
  const link = resolved.value
  const [packet] = await db.select().from(boardPackets).where(eq(boardPackets.id, link.packetId))
  if (packet === undefined) return err('not_found')
  const found = await packetDocument(db, packet, versionId, signal)
  if (!found.ok) return found
  await db
    .insert(boardPacketAccess)
    .values({ linkId: link.id, packetId: packet.id, versionId, accessedAt: now })
  return found
}

export async function listPacketAccess(db: Db, packetId: string) {
  return await db
    .select({
      versionId: boardPacketAccess.versionId,
      accessedAt: boardPacketAccess.accessedAt,
      recipientEmail: boardPacketLinks.recipientEmail,
    })
    .from(boardPacketAccess)
    .innerJoin(boardPacketLinks, eq(boardPacketLinks.id, boardPacketAccess.linkId))
    .where(eq(boardPacketLinks.packetId, packetId))
    .orderBy(desc(boardPacketAccess.accessedAt))
}

export { type PacketView, townDateOf }
