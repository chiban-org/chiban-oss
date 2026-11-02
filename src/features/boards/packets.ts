import type { Board } from '@packs/nh/schema'
import { asc, desc, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardPacketItems, boardPackets, documents, documentVersions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { documentOwners } from '@/features/boards/documentBoard'
import { BOARD_NAMES } from '@/features/hearings/views'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const ELIGIBLE_SCAN = 500

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
  const ownerOf = documentOwners(db, signal)
  const otherBoard = new Set<string>()
  for (const doc of docs) {
    const owner = await ownerOf(doc)
    if (owner !== null && owner.board !== input.board) otherBoard.add(doc.id)
  }
  const refused = picked
    .filter((p) => p.versionId === null || otherBoard.has(p.id))
    .map((p) => p.id)
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
      recordKind: documents.recordKind,
      recordId: documents.recordId,
    })
    .from(documents)
    .orderBy(desc(documents.seq))
    .limit(ELIGIBLE_SCAN)
  const ownerOf = documentOwners(db, signal)
  const out: { id: string; label: string; board: Board }[] = []
  for (const d of rows.filter((r) => r.audiences.includes('board') || r.isPublic)) {
    const owner = await ownerOf(d)
    if (owner === null) continue
    const prefix = owner.applicationNumber === null ? '' : `${owner.applicationNumber}: `
    out.push({
      id: d.id,
      label: `${prefix}${d.title}, ${BOARD_NAMES[owner.board]}`,
      board: owner.board,
    })
  }
  return ok(out)
}
