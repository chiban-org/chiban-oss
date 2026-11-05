import { pendingChanges } from '@/features/boards/packetChanges'
import type { PacketItemRow, SentMarks } from '@/features/boards/packetContents'

export interface ReviewLine {
  documentId: string
  title: string
  note: string | null
}

export function reviewLines(rows: PacketItemRow[], packet: SentMarks): ReviewLine[] {
  const changes = pendingChanges(rows, packet)
  const added = new Set(changes.added.map((r) => r.documentId))
  const replaced = new Set(changes.replaced.map((r) => r.documentId))
  const removed = new Set(changes.removed.map((r) => r.documentId))
  const titleOf = new Map(rows.map((r) => [r.documentId, r.title]))
  const noteOf = (row: PacketItemRow): string | null => {
    if (added.has(row.documentId)) return 'Added, not sent yet'
    if (replaced.has(row.documentId)) {
      return `Replaces ${titleOf.get(row.replacesDocumentId ?? '') ?? 'an earlier copy'}, not sent yet`
    }
    return removed.has(row.documentId) ? 'Removed, not sent yet' : null
  }
  return rows
    .filter((r) => r.removedAt === null || removed.has(r.documentId))
    .map((r) => ({ documentId: r.documentId, title: r.title, note: noteOf(r) }))
}
