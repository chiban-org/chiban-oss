import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  boardMeetings,
  boardPacketItems,
  boardPackets,
  documents,
  documentVersions,
  renditionApprovals,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { documentOwners } from '@/features/boards/documentBoard'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export interface CreatePacketInput {
  title: string
  meetingId: string
  documentIds: string[]
}

export type PacketError =
  | 'forbidden'
  | 'not_found'
  | 'meeting_cancelled'
  | 'packet_exists'
  | { notForBoard: string[] }

type MeetingRow = typeof boardMeetings.$inferSelect

async function packetMeeting(
  db: Db,
  meetingId: string,
): Promise<Result<MeetingRow, 'not_found' | 'meeting_cancelled' | 'packet_exists'>> {
  if (!isUuid(meetingId)) return err('not_found')
  const [meeting] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId))
  if (meeting === undefined) return err('not_found')
  if (meeting.status === 'cancelled') return err('meeting_cancelled')
  const [existing] = await db
    .select({ id: boardPackets.id })
    .from(boardPackets)
    .where(eq(boardPackets.meetingId, meetingId))
  return existing === undefined ? ok(meeting) : err('packet_exists')
}

interface Versioned {
  id: string
  role: string
  createdAt: Date
}

export interface FrozenVersion {
  versionId: string
  approvalId: string | null
}

export function frozenVersion(
  doc: { audiences: string[]; isPublic: boolean },
  versions: Versioned[],
  approved: { id: string; versionId: string } | null,
): FrozenVersion | null {
  const latest = (role: string) =>
    versions
      .filter((v) => v.role === role)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  if (doc.audiences.includes('board')) {
    const original = latest('original')
    return original === undefined ? null : { versionId: original.id, approvalId: null }
  }
  if (doc.isPublic && approved !== null) {
    return { versionId: approved.versionId, approvalId: approved.id }
  }
  return null
}

export async function createPacket(
  db: Db,
  actor: Actor,
  input: CreatePacketInput,
  signal: AbortSignal,
): Promise<Result<{ packetId: string }, PacketError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'packet.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const meeting = await packetMeeting(db, input.meetingId)
  if (!meeting.ok) return meeting
  const boardId = meeting.value.boardId
  const docs = await db.select().from(documents).where(inArray(documents.id, input.documentIds))
  const versions = await db
    .select()
    .from(documentVersions)
    .where(inArray(documentVersions.documentId, input.documentIds))
  const approvals = await db
    .select({
      id: renditionApprovals.id,
      documentId: renditionApprovals.documentId,
      versionId: renditionApprovals.versionId,
    })
    .from(renditionApprovals)
    .where(
      and(
        inArray(renditionApprovals.documentId, input.documentIds),
        eq(renditionApprovals.purpose, 'public'),
        isNull(renditionApprovals.revokedAt),
      ),
    )
  const approvedFor = new Map(approvals.map((a) => [a.documentId, a]))
  const picked = input.documentIds.map((id) => {
    const doc = docs.find((d) => d.id === id)
    const frozen =
      doc === undefined
        ? null
        : frozenVersion(
            doc,
            versions.filter((v) => v.documentId === id),
            approvedFor.get(id) ?? null,
          )
    return { id, frozen }
  })
  const ownerOf = documentOwners(db, signal)
  const otherBoard = new Set<string>()
  for (const doc of docs) {
    const owner = await ownerOf(doc)
    if (owner !== null && owner.boardId !== boardId) otherBoard.add(doc.id)
  }
  const refused = picked.filter((p) => p.frozen === null || otherBoard.has(p.id)).map((p) => p.id)
  if (refused.length > 0) return err({ notForBoard: refused })
  return await transactionResult<{ packetId: string }, PacketError>(db, async (tx) => {
    const [packet] = await tx
      .insert(boardPackets)
      .values({
        title: input.title,
        boardId,
        meetingDate: meeting.value.meetingDate,
        meetingId: meeting.value.id,
        createdBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning({ id: boardPackets.id })
    if (packet === undefined) return err('packet_exists')
    const packetId = packet.id
    const approvalIds = picked.flatMap((p) =>
      p.frozen?.approvalId == null ? [] : [p.frozen.approvalId],
    )
    if (approvalIds.length > 0) {
      const stillActive = await tx
        .select({ id: renditionApprovals.id })
        .from(renditionApprovals)
        .where(
          and(inArray(renditionApprovals.id, approvalIds), isNull(renditionApprovals.revokedAt)),
        )
        .for('share')
      const live = new Set(stillActive.map((r) => r.id))
      const lost = picked.filter(
        (p) => p.frozen?.approvalId != null && !live.has(p.frozen.approvalId),
      )
      if (lost.length > 0) return err({ notForBoard: lost.map((p) => p.id) })
    }
    await tx.insert(boardPacketItems).values(
      picked.map((p, position) => ({
        packetId,
        documentId: p.id,
        versionId: p.frozen?.versionId ?? '',
        approvalId: p.frozen?.approvalId ?? null,
        position,
      })),
    )
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'packet.create',
        entityType: 'board_packet',
        entityId: packetId,
        after: { documentIds: input.documentIds },
      },
      signal,
    )
    return ok({ packetId })
  })
}
