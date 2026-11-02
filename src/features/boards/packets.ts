import { asc, desc, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardPacketItems, boardPackets, documents, documentVersions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface CreatePacketInput {
  title: string
  board: 'planning_board' | 'zba'
  meetingDate: CivilDate
  documentIds: string[]
}

export type PacketError = 'forbidden' | { notForBoard: string[] }

interface Versioned {
  id: string
  role: string
  createdAt: Date
}

function frozenVersion(
  doc: { audiences: string[]; isPublic: boolean },
  versions: Versioned[],
): string | null {
  const latest = (role: string) =>
    versions
      .filter((v) => v.role === role)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  if (doc.audiences.includes('board')) return latest('original')?.id ?? null
  if (doc.isPublic) return (latest('public_redacted') ?? latest('original'))?.id ?? null
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
  const docs = await db.select().from(documents).where(inArray(documents.id, input.documentIds))
  const versions = await db
    .select()
    .from(documentVersions)
    .where(inArray(documentVersions.documentId, input.documentIds))
  const picked = input.documentIds.map((id) => {
    const doc = docs.find((d) => d.id === id)
    const versionId =
      doc === undefined
        ? null
        : frozenVersion(
            doc,
            versions.filter((v) => v.documentId === id),
          )
    return { id, versionId }
  })
  const refused = picked.filter((p) => p.versionId === null).map((p) => p.id)
  if (refused.length > 0) return err({ notForBoard: refused })
  return await transactionResult<{ packetId: string }, PacketError>(db, async (tx) => {
    const [packet] = await tx
      .insert(boardPackets)
      .values({
        title: input.title,
        board: input.board,
        meetingDate: input.meetingDate,
        createdBy: actor.userId,
      })
      .returning({ id: boardPackets.id })
    const packetId = packet?.id ?? ''
    await tx.insert(boardPacketItems).values(
      picked.map((p, position) => ({
        packetId,
        documentId: p.id,
        versionId: p.versionId ?? '',
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

export async function listPackets(db: Db, actor: Actor, signal: AbortSignal) {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'packet.manage', signal)
  if (!allowed.ok) return err('forbidden' as const)
  const rows = await db
    .select()
    .from(boardPackets)
    .orderBy(desc(boardPackets.meetingDate), asc(boardPackets.id))
  return ok(rows)
}

export async function eligibleBoardDocuments(db: Db, actor: Actor, signal: AbortSignal) {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'packet.manage', signal)
  if (!allowed.ok) return err('forbidden' as const)
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      audiences: documents.audiences,
      isPublic: documents.isPublic,
    })
    .from(documents)
    .orderBy(desc(documents.seq))
    .limit(200)
  return ok(rows.filter((d) => d.audiences.includes('board') || d.isPublic))
}
