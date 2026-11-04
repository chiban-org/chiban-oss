import { and, eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { boardPacketItems } from '@/db/schema'
import type { Candidate } from '@/features/boards/packetCandidates'

type ItemRow = typeof boardPacketItems.$inferSelect

export interface SelectionInput {
  packet: { id: string; lastSentAt: Date | null }
  candidates: Candidate[]
  selected: Set<string>
  now: Date
}

function removalWasSent(item: ItemRow, lastSentAt: Date | null): boolean {
  return (
    item.removedAt !== null &&
    lastSentAt !== null &&
    item.removedAt.getTime() <= lastSentAt.getTime()
  )
}

function itemKey(packetId: string, documentId: string) {
  return and(eq(boardPacketItems.packetId, packetId), eq(boardPacketItems.documentId, documentId))
}

async function keep(tx: Tx, input: SelectionInput, item: ItemRow, position: number) {
  const back = item.removedAt === null ? {} : { removedAt: null }
  const resend = removalWasSent(item, input.packet.lastSentAt) ? { sentAt: null } : {}
  await tx
    .update(boardPacketItems)
    .set({ position, ...back, ...resend })
    .where(itemKey(input.packet.id, item.documentId))
  return item.removedAt !== null
}

async function drop(tx: Tx, input: SelectionInput, item: ItemRow): Promise<boolean> {
  if (item.removedAt !== null) return false
  const where = itemKey(input.packet.id, item.documentId)
  if (item.sentAt === null) await tx.delete(boardPacketItems).where(where)
  else await tx.update(boardPacketItems).set({ removedAt: input.now }).where(where)
  return true
}

export async function applySelection(
  tx: Tx,
  input: SelectionInput,
): Promise<{ added: string[]; removed: string[] }> {
  const items = await tx
    .select()
    .from(boardPacketItems)
    .where(eq(boardPacketItems.packetId, input.packet.id))
  const byDocument = new Map(items.map((i) => [i.documentId, i]))
  const added: string[] = []
  const removed: string[] = []
  for (const [position, candidate] of input.candidates.entries()) {
    const item = byDocument.get(candidate.documentId)
    const wanted = input.selected.has(candidate.documentId) && candidate.exclusion === null
    if (wanted && item === undefined && candidate.frozen !== null) {
      await tx.insert(boardPacketItems).values({
        packetId: input.packet.id,
        documentId: candidate.documentId,
        versionId: candidate.frozen.versionId,
        approvalId: candidate.frozen.approvalId,
        position,
      })
      added.push(candidate.documentId)
    } else if (wanted && item !== undefined) {
      if (await keep(tx, input, item, position)) added.push(candidate.documentId)
    } else if (!wanted && item !== undefined && (await drop(tx, input, item))) {
      removed.push(candidate.documentId)
    }
  }
  return { added, removed }
}
