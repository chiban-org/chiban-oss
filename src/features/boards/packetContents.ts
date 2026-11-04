import { asc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { boardPacketItems, documents, documentVersions } from '@/db/schema'

export type PacketItemRow = Awaited<ReturnType<typeof packetItemRows>>[number]

export interface SentMarks {
  sentAt: Date | null
  lastSentAt: Date | null
}

export type ReaderMark = 'added' | 'replaced' | null

export type WithdrawnWhy = 'revoked' | 'disposed' | 'removed'

export interface ReaderItem {
  documentId: string
  versionId: string
  title: string
  filename: string
  mark: ReaderMark
  withdrawn: { at: Date; why: WithdrawnWhy } | null
}

export async function packetItemRows(db: DbOrTx, packetId: string) {
  return await db
    .select({
      documentId: boardPacketItems.documentId,
      versionId: boardPacketItems.versionId,
      formerVersionId: boardPacketItems.formerVersionId,
      position: boardPacketItems.position,
      title: documents.title,
      filename: documentVersions.filename,
      sentAt: boardPacketItems.sentAt,
      removedAt: boardPacketItems.removedAt,
      replacesDocumentId: boardPacketItems.replacesDocumentId,
      withdrawnAt: boardPacketItems.withdrawnAt,
      withdrawnReason: boardPacketItems.withdrawnReason,
    })
    .from(boardPacketItems)
    .innerJoin(documents, eq(documents.id, boardPacketItems.documentId))
    .leftJoin(documentVersions, eq(documentVersions.id, boardPacketItems.versionId))
    .where(eq(boardPacketItems.packetId, packetId))
    .orderBy(asc(boardPacketItems.position), asc(boardPacketItems.documentId))
}

function wasSent(at: Date | null, packet: SentMarks): boolean {
  return at !== null && packet.lastSentAt !== null && at.getTime() <= packet.lastSentAt.getTime()
}

export function isSentToReaders(item: PacketItemRow, packet: SentMarks): boolean {
  return wasSent(item.sentAt, packet)
}

export function isRemovalSent(item: PacketItemRow, packet: SentMarks): boolean {
  return wasSent(item.removedAt, packet)
}

function markOf(item: PacketItemRow, packet: SentMarks): ReaderMark {
  if (item.sentAt === null || packet.sentAt === null) return null
  if (item.sentAt.getTime() <= packet.sentAt.getTime()) return null
  return item.replacesDocumentId === null ? 'added' : 'replaced'
}

function withdrawnOf(item: PacketItemRow, packet: SentMarks): ReaderItem['withdrawn'] {
  if (item.withdrawnAt !== null) {
    return { at: item.withdrawnAt, why: item.withdrawnReason ?? 'revoked' }
  }
  if (item.removedAt !== null && isRemovalSent(item, packet)) {
    return { at: item.removedAt, why: 'removed' }
  }
  return null
}

export function readerItems(rows: PacketItemRow[], packet: SentMarks): ReaderItem[] {
  const sent = rows.filter((r) => isSentToReaders(r, packet))
  const replaced = new Set(
    sent
      .filter((r) => r.replacesDocumentId !== null && r.removedAt === null)
      .map((r) => r.replacesDocumentId),
  )
  return sent
    .filter((r) => !(replaced.has(r.documentId) && isRemovalSent(r, packet)))
    .map((r) => ({
      documentId: r.documentId,
      versionId: r.versionId ?? r.formerVersionId ?? '',
      title: r.title,
      filename: r.filename ?? '',
      mark: markOf(r, packet),
      withdrawn: withdrawnOf(r, packet),
    }))
}

export function readableVersion(
  rows: PacketItemRow[],
  packet: SentMarks,
  versionId: string,
): { item: ReaderItem; row: PacketItemRow } | null {
  const items = readerItems(rows, packet)
  const item = items.find((i) => i.versionId === versionId)
  const row = rows.find((r) => r.versionId === versionId || r.formerVersionId === versionId)
  return item === undefined || row === undefined ? null : { item, row }
}
