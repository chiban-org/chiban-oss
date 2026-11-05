import { and, eq, isNull } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { boardPacketItems, boardPackets, documents } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { type Candidate, packetCandidates } from '@/features/boards/packetCandidates'
import {
  type GatherError,
  type PacketMeeting,
  packetMeetingOf,
} from '@/features/boards/packetGather'
import { applySelection } from '@/features/boards/packetSelection'
import { makeTrcSummaries } from '@/features/boards/packetTrc'
import { setAudiences } from '@/features/documents/publish'
import type { Audience } from '@/features/documents/types'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export interface SavePacketInput {
  meetingId: string
  documentIds: string[]
  trcApplicationIds: string[]
}

export type SavePacketError = GatherError | 'empty' | { notForBoard: string[] }

function refusedOf(candidates: Candidate[], kept: string[], documentIds: string[]): string[] {
  const allowed = new Set([
    ...candidates.filter((c) => c.exclusion === null).map((c) => c.documentId),
    ...kept,
  ])
  return documentIds.filter((id) => !allowed.has(id))
}

async function keptItems(db: Db, packetId: string | undefined): Promise<string[]> {
  if (packetId === undefined) return []
  const rows = await db
    .select({ documentId: boardPacketItems.documentId })
    .from(boardPacketItems)
    .where(and(eq(boardPacketItems.packetId, packetId), isNull(boardPacketItems.removedAt)))
  return rows.map((r) => r.documentId)
}

async function packetIdFor(tx: Tx, actor: Actor, context: PacketMeeting): Promise<string> {
  if (context.packet !== null) return context.packet.id
  const [made] = await tx
    .insert(boardPackets)
    .values({
      title: context.defaultTitle,
      board: context.meeting.board,
      meetingDate: context.meeting.meetingDate,
      meetingId: context.meeting.id,
      createdBy: actor.userId,
    })
    .returning({ id: boardPackets.id })
  return made?.id ?? ''
}

export async function savePacket(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: SavePacketInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ packetId: string; added: number; removed: number }, SavePacketError>> {
  const context = await packetMeetingOf(db, actor, input.meetingId, signal)
  if (!context.ok) return context
  const { meeting, agendaDocumentId, packet } = context.value
  const first = await packetCandidates(db, meeting, agendaDocumentId, signal)
  const kept = await keptItems(db, packet?.id)
  const refused = refusedOf(first.candidates, kept, input.documentIds)
  if (refused.length > 0) return err({ notForBoard: refused })
  if (packet === null && input.documentIds.length === 0 && input.trcApplicationIds.length === 0) {
    return err('empty')
  }
  const made = await makeTrcSummaries(db, store, actor, {
    applicationIds: input.trcApplicationIds.filter((id) =>
      first.groups.some((g) => g.applicationId === id),
    ),
    signal,
  })
  return await transactionResult(db, async (tx) => {
    const packetId = await packetIdFor(tx, actor, context.value)
    const { candidates } = await packetCandidates(tx, meeting, agendaDocumentId, signal)
    const change = await applySelection(tx, {
      packet: { id: packetId },
      candidates,
      selected: new Set([...input.documentIds, ...made]),
      now,
    })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'packet.save',
        entityType: 'board_packet',
        entityId: packetId,
        after: { added: change.added, removed: change.removed },
      },
      signal,
    )
    return ok({ packetId, added: change.added.length, removed: change.removed.length })
  })
}

export async function renamePacket(
  db: Db,
  actor: Actor,
  input: { packetId: string; title: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found' | 'title_required'>> {
  const allowed = await requireCapability(db, actor.userId, 'packet.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const title = input.title.trim()
  if (title === '') return err('title_required')
  const changed = await db
    .update(boardPackets)
    .set({ title })
    .where(eq(boardPackets.id, input.packetId))
    .returning({ id: boardPackets.id })
  return changed.length === 0 ? err('not_found') : ok(undefined)
}

export async function shareWithBoard(
  db: Db,
  actor: Actor,
  input: { documentId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found' | 'invalid_audience'>> {
  const [doc] = await db
    .select({ audiences: documents.audiences })
    .from(documents)
    .where(eq(documents.id, input.documentId))
  if (doc === undefined) return err('not_found')
  const audiences = [...new Set([...(doc.audiences as Audience[]), 'board' as const])]
  return await setAudiences(db, actor, { documentId: input.documentId, audiences }, signal)
}
