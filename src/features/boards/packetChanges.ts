import {
  isRemovalSent,
  isSentToReaders,
  type PacketItemRow,
  type SentMarks,
} from '@/features/boards/packetContents'

export interface PendingChanges {
  added: PacketItemRow[]
  replaced: PacketItemRow[]
  removed: PacketItemRow[]
  superseded: PacketItemRow[]
}

export function pendingChanges(rows: PacketItemRow[], packet: SentMarks): PendingChanges {
  if (packet.sentAt === null) return { added: [], replaced: [], removed: [], superseded: [] }
  const incoming = rows.filter((r) => r.removedAt === null && !isSentToReaders(r))
  const replacedIds = new Set(incoming.map((r) => r.replacesDocumentId))
  const leaving = rows.filter(
    (r) => r.removedAt !== null && isSentToReaders(r) && !isRemovalSent(r),
  )
  return {
    added: incoming.filter((r) => r.replacesDocumentId === null),
    replaced: incoming.filter((r) => r.replacesDocumentId !== null),
    removed: leaving.filter((r) => !replacedIds.has(r.documentId)),
    superseded: leaving.filter((r) => replacedIds.has(r.documentId)),
  }
}

export function changeCount(changes: PendingChanges): number {
  return changes.added.length + changes.replaced.length + changes.removed.length
}

export function changeSummary(changes: PendingChanges): string {
  const parts = [
    ['Added', changes.added],
    ['Replaced', changes.replaced],
    ['Removed', changes.removed],
  ] as const
  return parts
    .filter(([, rows]) => rows.length > 0)
    .map(([label, rows]) => `${label}: ${rows.map((r) => r.title).join(', ')}`)
    .join('; ')
}
