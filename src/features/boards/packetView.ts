import { asc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardPacketItems, boardPackets, documents, documentVersions } from '@/db/schema'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'

export interface PacketView {
  packetId: string
  title: string
  board: 'planning_board' | 'zba'
  meetingDate: CivilDate
  expiresAt: string
  items: { versionId: string; title: string; filename: string; withdrawnOn: CivilDate | null }[]
}

export async function townDateOf(db: Db, at: Date, signal: AbortSignal): Promise<CivilDate> {
  const town = await getTownSettings(db, signal)
  return todayInTimeZone(town.ok ? town.value.timeZone : 'UTC', at)
}

export async function loadPacketView(
  db: Db,
  packetId: string,
  expiresAt: string,
  signal: AbortSignal,
): Promise<PacketView | null> {
  const [packet] = await db.select().from(boardPackets).where(eq(boardPackets.id, packetId))
  if (packet === undefined) return null
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
  return {
    packetId: packet.id,
    title: packet.title,
    board: packet.board,
    meetingDate: packet.meetingDate as CivilDate,
    expiresAt,
    items: await Promise.all(
      items.map(async ({ withdrawnAt, formerVersionId, ...item }) => ({
        title: item.title,
        versionId: item.versionId ?? formerVersionId ?? '',
        filename: item.filename ?? '',
        withdrawnOn: withdrawnAt === null ? null : await townDateOf(db, withdrawnAt, signal),
      })),
    ),
  }
}
