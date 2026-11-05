import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { boardPacketItems, renditionApprovals } from '@/db/schema'
import type { Candidate } from '@/features/boards/packetCandidates'

type ItemRow = typeof boardPacketItems.$inferSelect

export interface SelectionInput {
  packet: { id: string }
  candidates: Candidate[]
  selected: Set<string>
  now: Date
}

function itemKey(packetId: string, documentId: string) {
  return and(eq(boardPacketItems.packetId, packetId), eq(boardPacketItems.documentId, documentId))
}

async function keep(tx: Tx, input: SelectionInput, item: ItemRow, position: number) {
  const back = item.removedAt === null ? {} : { removedAt: null }
  const readd = item.removalSentAt === null ? {} : { sentAt: null }
  await tx
    .update(boardPacketItems)
    .set({ position, ...back, ...readd })
    .where(itemKey(input.packet.id, item.documentId))
  return item.removedAt !== null
}

async function drop(tx: Tx, input: SelectionInput, item: ItemRow): Promise<boolean> {
  if (item.removedAt !== null) return false
  const where = itemKey(input.packet.id, item.documentId)
  if (item.sentAt === null && item.removalSentAt === null) {
    await tx.delete(boardPacketItems).where(where)
  } else {
    await tx.update(boardPacketItems).set({ removedAt: input.now }).where(where)
  }
  return true
}

async function liveApprovals(tx: Tx, candidates: Candidate[]): Promise<Set<string>> {
  const ids = candidates.flatMap((c) => (c.frozen?.approvalId == null ? [] : [c.frozen.approvalId]))
  if (ids.length === 0) return new Set()
  const rows = await tx
    .select({ id: renditionApprovals.id })
    .from(renditionApprovals)
    .where(and(inArray(renditionApprovals.id, ids), isNull(renditionApprovals.revokedAt)))
    .for('share')
  return new Set(rows.map((r) => r.id))
}

function insertable(candidate: Candidate, live: Set<string>): boolean {
  if (candidate.frozen === null) return false
  return candidate.frozen.approvalId === null || live.has(candidate.frozen.approvalId)
}

interface Step {
  candidate: Candidate
  item: ItemRow | undefined
  position: number
  live: Set<string>
}

async function applyOne(
  tx: Tx,
  input: SelectionInput,
  step: Step,
): Promise<'added' | 'removed' | null> {
  const { candidate, item, position } = step
  const wanted = input.selected.has(candidate.documentId) && candidate.exclusion === null
  if (!wanted) return item !== undefined && (await drop(tx, input, item)) ? 'removed' : null
  if (item !== undefined) return (await keep(tx, input, item, position)) ? 'added' : null
  if (candidate.frozen === null || !insertable(candidate, step.live)) return null
  await tx.insert(boardPacketItems).values({
    packetId: input.packet.id,
    documentId: candidate.documentId,
    versionId: candidate.frozen.versionId,
    approvalId: candidate.frozen.approvalId,
    position,
  })
  return 'added'
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
  const live = await liveApprovals(tx, input.candidates)
  const changed = { added: [] as string[], removed: [] as string[] }
  for (const [position, candidate] of input.candidates.entries()) {
    const item = byDocument.get(candidate.documentId)
    byDocument.delete(candidate.documentId)
    const result = await applyOne(tx, input, { candidate, item, position, live })
    if (result !== null) changed[result].push(candidate.documentId)
  }
  for (const item of byDocument.values()) {
    if (!input.selected.has(item.documentId) && (await drop(tx, input, item))) {
      changed.removed.push(item.documentId)
    }
  }
  return changed
}
