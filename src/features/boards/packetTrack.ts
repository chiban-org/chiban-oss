import { and, asc, count, eq, isNull, max, min, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardPacketAccess, boardPacketLinks, boardPacketMembers, users } from '@/db/schema'

export type TrackGets =
  | { kind: 'member'; userId: string }
  | { kind: 'link'; linkId: string; expiresAt: Date; revoked: boolean }

export interface TrackRow {
  key: string
  name: string
  email: string
  gets: TrackGets
  sentAt: Date
  firstOpenedAt: Date | null
  lastOpenedAt: Date | null
  documentsOpened: number
}

const reads = {
  firstOpenedAt: min(boardPacketAccess.accessedAt),
  lastOpenedAt: max(boardPacketAccess.accessedAt),
  documentsOpened: count(sql`distinct ${boardPacketAccess.versionId}`),
}

async function memberRows(db: Db, packetId: string): Promise<TrackRow[]> {
  const rows = await db
    .select({
      userId: boardPacketMembers.userId,
      name: users.displayName,
      email: users.email,
      sentAt: boardPacketMembers.sentAt,
      ...reads,
    })
    .from(boardPacketMembers)
    .innerJoin(users, eq(users.id, boardPacketMembers.userId))
    .leftJoin(
      boardPacketAccess,
      and(
        eq(boardPacketAccess.packetId, boardPacketMembers.packetId),
        eq(boardPacketAccess.userId, boardPacketMembers.userId),
      ),
    )
    .where(eq(boardPacketMembers.packetId, packetId))
    .groupBy(boardPacketMembers.userId, users.displayName, users.email, boardPacketMembers.sentAt)
    .orderBy(asc(users.displayName))
  return rows.map(({ userId, ...row }) => ({
    ...row,
    key: `member:${userId}`,
    gets: { kind: 'member', userId },
  }))
}

async function linkRows(db: Db, packetId: string): Promise<TrackRow[]> {
  const rows = await db
    .select({
      linkId: boardPacketLinks.id,
      name: boardPacketLinks.recipientName,
      email: boardPacketLinks.recipientEmail,
      sentAt: boardPacketLinks.createdAt,
      expiresAt: boardPacketLinks.expiresAt,
      revoked: sql<boolean>`${boardPacketLinks.revokedAt} is not null`,
      ...reads,
    })
    .from(boardPacketLinks)
    .leftJoin(
      boardPacketAccess,
      and(eq(boardPacketAccess.linkId, boardPacketLinks.id), isNull(boardPacketAccess.userId)),
    )
    .where(eq(boardPacketLinks.packetId, packetId))
    .groupBy(boardPacketLinks.id)
    .orderBy(asc(boardPacketLinks.createdAt))
  return rows.map(({ linkId, expiresAt, revoked, ...row }) => ({
    ...row,
    key: `link:${linkId}`,
    gets: { kind: 'link', linkId, expiresAt, revoked },
  }))
}

export async function trackPacket(db: Db, packetId: string): Promise<TrackRow[]> {
  return [...(await memberRows(db, packetId)), ...(await linkRows(db, packetId))]
}
