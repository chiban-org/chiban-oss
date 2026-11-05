import { and, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { agendas, boardPacketItems, boardPackets, documents, documentVersions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { agendaDocumentIds } from '@/features/boards/packetCandidates'
import { type PacketItemRow, packetItemRows } from '@/features/boards/packetContents'
import { frozenVersion } from '@/features/boards/packets'
import { err, ok, type Result } from '@/types/result'

export interface AgendaReplacement {
  packetId: string
  old: PacketItemRow
  newDocumentId: string
}

export async function agendaReplacement(
  db: Db,
  packetId: string,
  meetingId: string,
): Promise<AgendaReplacement | null> {
  const [agenda] = await db.select().from(agendas).where(eq(agendas.meetingId, meetingId))
  const current = agenda?.status === 'published' ? agenda.documentId : null
  if (current === null) return null
  const active = (await packetItemRows(db, packetId)).filter((r) => r.removedAt === null)
  if (active.some((r) => r.documentId === current)) return null
  const published = await agendaDocumentIds(db, meetingId)
  const old = active.find((r) => published.has(r.documentId))
  return old === undefined ? null : { packetId, old, newDocumentId: current }
}

async function frozenOf(tx: Tx, documentId: string) {
  const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId))
  if (doc === undefined) return null
  const versions = await tx
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
  return frozenVersion(doc, versions, null)
}

async function swap(tx: Tx, replacement: AgendaReplacement, now: Date): Promise<boolean> {
  const { packetId, old, newDocumentId } = replacement
  const frozen = await frozenOf(tx, newDocumentId)
  if (frozen === null) return false
  const oldKey = and(
    eq(boardPacketItems.packetId, packetId),
    eq(boardPacketItems.documentId, old.documentId),
  )
  if (old.sentAt === null) await tx.delete(boardPacketItems).where(oldKey)
  else await tx.update(boardPacketItems).set({ removedAt: now }).where(oldKey)
  const values = {
    versionId: frozen.versionId,
    position: old.position,
    sentAt: null,
    removedAt: null,
    replacesDocumentId: old.sentAt === null ? null : old.documentId,
  }
  await tx
    .insert(boardPacketItems)
    .values({ packetId, documentId: newDocumentId, ...values })
    .onConflictDoUpdate({
      target: [boardPacketItems.packetId, boardPacketItems.documentId],
      set: values,
    })
  return true
}

export async function replacePacketAgenda(
  db: Db,
  actor: Actor,
  input: { meetingId: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, 'forbidden' | 'not_found' | 'nothing_to_replace'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'packet.manage', signal))) return err('forbidden')
  const [packet] = await db
    .select({ id: boardPackets.id })
    .from(boardPackets)
    .where(eq(boardPackets.meetingId, input.meetingId))
  if (packet === undefined) return err('not_found')
  const replacement = await agendaReplacement(db, packet.id, input.meetingId)
  if (replacement === null) return err('nothing_to_replace')
  return await transactionResult<void, 'forbidden' | 'not_found' | 'nothing_to_replace'>(
    db,
    async (tx) => {
      if (!(await swap(tx, replacement, now))) return err('not_found')
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'packet.agenda.replace',
          entityType: 'board_packet',
          entityId: packet.id,
          after: { from: replacement.old.documentId, to: replacement.newDocumentId },
        },
        signal,
      )
      return ok(undefined)
    },
  )
}
