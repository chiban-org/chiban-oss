import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardPackets } from '@/db/schema'
import {
  packetItemRows,
  type ReaderItem,
  type ReaderMark,
  readerItems,
  type WithdrawnWhy,
} from '@/features/boards/packetContents'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'

export interface PacketViewItem {
  versionId: string
  title: string
  filename: string
  mark: ReaderMark
  withdrawnOn: CivilDate | null
  withdrawnWhy: WithdrawnWhy | null
}

export interface PacketView {
  packetId: string
  title: string
  board: 'planning_board' | 'zba'
  meetingDate: CivilDate
  expiresAt: string
  items: PacketViewItem[]
}

export async function townDateOf(db: Db, at: Date, signal: AbortSignal): Promise<CivilDate> {
  const town = await getTownSettings(db, signal)
  return todayInTimeZone(town.ok ? town.value.timeZone : 'UTC', at)
}

export async function viewItems(
  db: Db,
  items: ReaderItem[],
  signal: AbortSignal,
): Promise<PacketViewItem[]> {
  return await Promise.all(
    items.map(async (item) => ({
      versionId: item.versionId,
      title: item.title,
      filename: item.filename,
      mark: item.mark,
      withdrawnOn: item.withdrawn === null ? null : await townDateOf(db, item.withdrawn.at, signal),
      withdrawnWhy: item.withdrawn?.why ?? null,
    })),
  )
}

export async function loadPacketView(
  db: Db,
  packetId: string,
  expiresAt: string,
  signal: AbortSignal,
): Promise<PacketView | null> {
  const [packet] = await db.select().from(boardPackets).where(eq(boardPackets.id, packetId))
  if (packet === undefined) return null
  const rows = await packetItemRows(db, packet.id)
  return {
    packetId: packet.id,
    title: packet.title,
    board: packet.board,
    meetingDate: packet.meetingDate as CivilDate,
    expiresAt,
    items: await viewItems(db, readerItems(rows, packet), signal),
  }
}
