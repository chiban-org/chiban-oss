import { createHash, randomBytes } from 'node:crypto'
import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import {
  boardMemberships,
  boardPacketAccess,
  boardPacketItems,
  boardPacketLinks,
  boardPackets,
  documents,
  documentVersions,
  files,
  users,
} from '@/db/schema'
import { activeMembershipOn } from '@/features/access/predicates'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { MailTransport } from '@/features/mail/transport'
import type { StoredObject } from '@/features/storage/delivery'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const TOKEN_BYTES = 32
const DEFAULT_DAYS = 14
const MAX_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export function hashPacketToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

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

async function notifyMember(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  packet: typeof boardPackets.$inferSelect,
  input: { recipientName: string; recipientEmail: string },
  signal: AbortSignal,
): Promise<Result<{ linkId: string | null; viaAccount: boolean }, 'send_failed'>> {
  const date = formatCivilDate(packet.meetingDate)
  const text = `Packet ready: sign in at ${env.BASE_URL}/board to read the packet for the ${date} meeting.\n`
  const sent = await mail.send(
    {
      to: input.recipientEmail,
      subject: `Board packet: ${packet.title}, meeting ${date}`,
      text,
      html: `<p>Packet ready: sign in at <a href="${env.BASE_URL}/board">${env.BASE_URL}/board</a> to read the packet for the ${date} meeting.</p>`,
    },
    signal,
  )
  if (!sent.ok) return err('send_failed')
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'packet.member.notify',
      entityType: 'board_packet',
      entityId: packet.id,
      after: { recipientName: input.recipientName, recipientEmail: input.recipientEmail },
    },
    signal,
  )
  return ok({ linkId: null, viaAccount: true })
}

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
): Promise<
  Result<
    { linkId: string | null; viaAccount: boolean },
    'forbidden' | 'expiry_too_long' | 'not_found' | 'send_failed'
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'packet.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const days = input.expiresInDays ?? DEFAULT_DAYS
  if (days > MAX_DAYS) return err('expiry_too_long')
  const [packet] = await db.select().from(boardPackets).where(eq(boardPackets.id, input.packetId))
  if (packet === undefined) return err('not_found')
  const recipientEmail = input.recipientEmail.trim().toLowerCase()
  if (await isActiveMemberOf(db, recipientEmail, packet.board)) {
    return await notifyMember(db, mail, actor, packet, { ...input, recipientEmail }, signal)
  }
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const [created] = await db
    .insert(boardPacketLinks)
    .values({
      packetId: packet.id,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail.trim().toLowerCase(),
      tokenHash: hashPacketToken(token),
      expiresAt: new Date(now.getTime() + days * DAY_MS),
      createdBy: actor.userId,
      createdAt: now,
    })
    .returning({ id: boardPacketLinks.id })
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'packet.link.send',
      entityType: 'board_packet',
      entityId: packet.id,
      after: { linkId: created?.id, recipientEmail: input.recipientEmail },
    },
    signal,
  )
  const link = `${env.BASE_URL}/board/packets/${token}`
  const date = formatCivilDate(packet.meetingDate)
  const sent = await mail.send(
    {
      to: input.recipientEmail.trim().toLowerCase(),
      subject: `Board packet: ${packet.title}, meeting ${date}`,
      text: `${input.recipientName}, the packet for the ${date} meeting is ready. The link expires in ${days} days.\n\n${link}\n`,
      html: `<p>${input.recipientName}, the packet for the ${date} meeting is ready. The link expires in ${days} days.</p><p><a href="${link}">Open the packet</a></p>`,
    },
    signal,
  )
  if (!sent.ok) return err('send_failed')
  return ok({ linkId: created?.id ?? '', viaAccount: false })
}

export async function revokePacketLink(
  db: Db,
  actor: Actor,
  input: { linkId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'packet.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const revoked = await db
    .update(boardPacketLinks)
    .set({ revokedAt: new Date() })
    .where(eq(boardPacketLinks.id, input.linkId))
    .returning({ id: boardPacketLinks.id })
  return revoked.length === 0 ? err('not_found') : ok(undefined)
}

export interface PacketView {
  packetId: string
  title: string
  board: 'planning_board' | 'zba'
  meetingDate: CivilDate
  expiresAt: string
  items: { versionId: string; title: string; filename: string; withdrawnOn: CivilDate | null }[]
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
  const [packet] = await db.select().from(boardPackets).where(eq(boardPackets.id, link.packetId))
  if (packet === undefined) return err('invalid')
  const items = await db
    .select({
      versionId: boardPacketItems.versionId,
      formerVersionId: boardPacketItems.formerVersionId,
      title: documents.title,
      filename: documentVersions.filename,
      withdrawnAt: boardPacketItems.withdrawnAt,
    })
    .from(boardPacketItems)
    .innerJoin(documents, eq(documents.id, boardPacketItems.documentId))
    .leftJoin(documentVersions, eq(documentVersions.id, boardPacketItems.versionId))
    .where(eq(boardPacketItems.packetId, packet.id))
    .orderBy(asc(boardPacketItems.position))
  await db.insert(boardPacketAccess).values({ linkId: link.id, versionId: null, accessedAt: now })
  return ok({
    packetId: packet.id,
    title: packet.title,
    board: packet.board,
    meetingDate: packet.meetingDate as CivilDate,
    expiresAt: link.expiresAt.toISOString(),
    items: await Promise.all(
      items.map(async ({ withdrawnAt, formerVersionId, ...item }) => ({
        title: item.title,
        versionId: item.versionId ?? formerVersionId ?? '',
        filename: item.filename ?? '',
        withdrawnOn: withdrawnAt === null ? null : await townDateOf(db, withdrawnAt, signal),
      })),
    ),
  })
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
  const [row] = await db
    .select({
      storageKey: files.storageKey,
      filename: documentVersions.filename,
      contentType: documentVersions.contentType,
      withdrawnAt: boardPacketItems.withdrawnAt,
    })
    .from(boardPacketItems)
    .leftJoin(documentVersions, eq(documentVersions.id, boardPacketItems.versionId))
    .leftJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(
      and(
        eq(boardPacketItems.packetId, link.packetId),
        or(
          eq(boardPacketItems.versionId, versionId),
          eq(boardPacketItems.formerVersionId, versionId),
        ),
      ),
    )
  if (row === undefined) return err('not_found')
  if (row.withdrawnAt !== null) {
    return err({ withdrawnOn: await townDateOf(db, row.withdrawnAt, signal) })
  }
  if (row.storageKey === null || row.filename === null || row.contentType === null) {
    return err('not_found')
  }
  await db.insert(boardPacketAccess).values({ linkId: link.id, versionId, accessedAt: now })
  return ok({ storageKey: row.storageKey, filename: row.filename, contentType: row.contentType })
}

export async function townDateOf(db: Db, at: Date, signal: AbortSignal): Promise<CivilDate> {
  const town = await getTownSettings(db, signal)
  return todayInTimeZone(town.ok ? town.value.timeZone : 'UTC', at)
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
