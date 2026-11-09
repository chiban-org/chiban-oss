import { eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { type BoardPacketRow, boardMeetings, boardPackets } from '@/db/schema'
import {
  type ItemCase,
  NO_CASE,
  type PacketAgendaItem,
  packetCases,
} from '@/features/boards/packetCases'
import {
  packetItemRows,
  type ReaderItem,
  type ReaderMark,
  readerItems,
  type WithdrawnWhy,
} from '@/features/boards/packetContents'
import { getBoard } from '@/features/boards/townBoards'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'

export type { PacketAgendaItem }

export interface PacketViewItem {
  versionId: string
  title: string
  filename: string
  mark: ReaderMark
  withdrawnOn: CivilDate | null
  withdrawnWhy: WithdrawnWhy | null
}

export type PacketCaseItem = PacketViewItem & ItemCase

export interface PacketPlace {
  startsAtMinute: number
  location: string
}

export interface PacketBody {
  packetId: string
  title: string
  boardId: string
  boardName: string
  boardShortName: string
  meetingDate: CivilDate
  place: PacketPlace | null
  agenda: PacketAgendaItem[]
  items: PacketCaseItem[]
}

export interface PacketView {
  packetId: string
  title: string
  boardId: string
  boardName: string
  boardShortName: string
  meetingDate: CivilDate
  expiresAt: string
  items: PacketViewItem[]
}

export interface PacketReaderView extends PacketBody {
  expiresAt: string
  expiresOn: CivilDate | null
}

export async function townDateOf(db: Db, at: Date, signal: AbortSignal): Promise<CivilDate> {
  const town = await getTownSettings(db, signal)
  return todayInTimeZone(town.ok ? town.value.timeZone : 'UTC', at)
}

export async function viewItems(
  db: Db,
  items: ReaderItem[],
  signal: AbortSignal,
  caseOf: (documentId: string) => ItemCase = () => NO_CASE,
): Promise<PacketCaseItem[]> {
  return await Promise.all(
    items.map(async (item) => ({
      versionId: item.versionId,
      title: item.title,
      filename: item.filename,
      mark: item.mark,
      withdrawnOn: item.withdrawn === null ? null : await townDateOf(db, item.withdrawn.at, signal),
      withdrawnWhy: item.withdrawn?.why ?? null,
      ...caseOf(item.documentId),
    })),
  )
}

export async function packetPlace(
  db: DbOrTx,
  meetingId: string | null,
): Promise<PacketPlace | null> {
  if (meetingId === null) return null
  const [meeting] = await db
    .select({ startsAtMinute: boardMeetings.startsAtMinute, location: boardMeetings.location })
    .from(boardMeetings)
    .where(eq(boardMeetings.id, meetingId))
  return meeting ?? null
}

export async function packetBody(
  db: Db,
  packet: BoardPacketRow,
  signal: AbortSignal,
): Promise<PacketBody> {
  const rows = await packetItemRows(db, packet.id)
  const readers = readerItems(rows, packet)
  const [board, place, cases] = await Promise.all([
    getBoard(db, packet.boardId),
    packetPlace(db, packet.meetingId),
    packetCases(db, {
      meetingId: packet.meetingId,
      documentIds: readers.map((r) => r.documentId),
    }),
  ])
  return {
    packetId: packet.id,
    title: packet.title,
    boardId: packet.boardId,
    boardName: board?.name ?? '',
    boardShortName: board?.shortName ?? '',
    meetingDate: packet.meetingDate as CivilDate,
    place,
    agenda: cases.agenda,
    items: await viewItems(db, readers, signal, cases.caseOf),
  }
}

export async function loadPacketView(
  db: Db,
  packetId: string,
  expiresAt: string,
  signal: AbortSignal,
): Promise<PacketReaderView | null> {
  const [packet] = await db.select().from(boardPackets).where(eq(boardPackets.id, packetId))
  if (packet === undefined) return null
  const expires = new Date(expiresAt)
  return {
    ...(await packetBody(db, packet, signal)),
    expiresAt,
    expiresOn: Number.isNaN(expires.getTime()) ? null : await townDateOf(db, expires, signal),
  }
}
