import { and, eq } from 'drizzle-orm'
import { boardPacketAccess, boardPacketItems, boardPackets, documents } from '@/db/schema'
import { getMemberPacket, openMemberPacketVersion } from '@/features/boards/memberPackets'
import { savePacket } from '@/features/boards/packetSave'
import { sendPacketToBoard } from '@/features/boards/packetSend'
import type { CoverageContext } from '@/features/demo/seedCoverage'
import { actorFor, must } from '@/features/demo/seedPermitSupport'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { plainFrame } from '@/features/pdf/frame'
import { renderPdf } from '@/features/pdf/renderPdf'

export const UNSENT_MEMO_TITLE = 'Zoning administrator memo'

async function packetOf(ctx: CoverageContext, meetingId: string) {
  const [packet] = await ctx.db
    .select()
    .from(boardPackets)
    .where(eq(boardPackets.meetingId, meetingId))
  return packet ?? null
}

async function sentToBoard(ctx: CoverageContext, meetingId: string) {
  const packet = await packetOf(ctx, meetingId)
  if (packet === null) return null
  if (packet.sentAt !== null) return packet
  must(
    await sendPacketToBoard(ctx.db, ctx.mail, ctx.cast.staff, { packetId: packet.id }, ctx.signal),
    'send packet to the board',
  )
  return await packetOf(ctx, meetingId)
}

export async function sentPacketWithReads(
  ctx: CoverageContext,
  meetingId: string,
): Promise<boolean> {
  const packet = await sentToBoard(ctx, meetingId)
  if (packet === null) return false
  const reader = await actorFor(ctx.db, 'pb.member', ctx.signal)
  const reads = await ctx.db
    .select({ id: boardPacketAccess.id })
    .from(boardPacketAccess)
    .where(
      and(eq(boardPacketAccess.packetId, packet.id), eq(boardPacketAccess.userId, reader.userId)),
    )
  if (reads.length > 0) return false
  const view = must(await getMemberPacket(ctx.db, reader, meetingId, ctx.signal), 'member packet')
  const first = view.items[0]
  if (first !== undefined) {
    await openMemberPacketVersion(
      ctx.db,
      reader,
      { meetingId, versionId: first.versionId },
      ctx.signal,
    )
  }
  return true
}

async function memoDocument(ctx: CoverageContext, meetingId: string): Promise<string> {
  const bytes = await renderPdf({
    title: UNSENT_MEMO_TITLE,
    frame: plainFrame('Town of Alder Pond'),
    scale: 'document',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Notes from the zoning administrator on the variance requests before the board.',
      },
    ],
  })
  return await ctx.db.transaction(async (tx) => {
    const stored = await storeGeneratedBytes(tx, ctx.store, bytes, 'application/pdf', ctx.signal)
    const attached = await attachDocument(
      tx,
      ctx.cast.staff,
      {
        target: { kind: 'meeting', id: meetingId },
        title: UNSENT_MEMO_TITLE,
        docKind: 'board_material',
        file: { sha256: stored.sha256, filename: 'memo.pdf', contentType: 'application/pdf' },
        audiences: ['board'],
        isPublic: false,
      },
      ctx.signal,
    )
    return attached.documentId
  })
}

export async function packetWithUnsentChange(
  ctx: CoverageContext,
  meetingId: string,
): Promise<boolean> {
  const packet = await sentToBoard(ctx, meetingId)
  if (packet === null) return false
  const memo = await ctx.db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.recordId, meetingId), eq(documents.title, UNSENT_MEMO_TITLE)))
  if (memo.length > 0) return false
  const memoId = await memoDocument(ctx, meetingId)
  const items = await ctx.db
    .select({ documentId: boardPacketItems.documentId, removedAt: boardPacketItems.removedAt })
    .from(boardPacketItems)
    .where(eq(boardPacketItems.packetId, packet.id))
  const kept = items.filter((i) => i.removedAt === null).map((i) => i.documentId)
  must(
    await savePacket(
      ctx.db,
      ctx.store,
      ctx.cast.staff,
      { meetingId, documentIds: [...kept, memoId], trcApplicationIds: [] },
      ctx.signal,
    ),
    'unsent packet change',
  )
  return true
}
