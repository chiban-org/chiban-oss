import { and, eq, inArray, or, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { agendaItems, agendas, boardMeetings, documents, hearings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { createPacket } from '@/features/boards/packets'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { trcSummaryPdf } from '@/features/reviews/trcSummary'
import type { ObjectStore } from '@/features/storage/objectStore'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type MeetingPacketError = 'forbidden' | 'not_found' | 'empty' | { notForBoard: string[] }

const BOARD_OR_PUBLIC = sql`('board' = any(${documents.audiences}) or ${documents.isPublic})`

export async function createMeetingPacket(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<{ packetId: string; documents: number }, MeetingPacketError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'packet.manage', signal))) return err('forbidden')
  const [meeting] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId))
  if (meeting === undefined) return err('not_found')
  const [agenda] = await db.select().from(agendas).where(eq(agendas.meetingId, meetingId))
  if (agenda === undefined) return err('empty')
  const applicationRows = await db
    .selectDistinct({ applicationId: hearings.applicationId })
    .from(agendaItems)
    .innerJoin(hearings, eq(hearings.id, agendaItems.hearingId))
    .where(eq(agendaItems.meetingId, meetingId))
  const applicationIds = applicationRows.map((r) => r.applicationId)
  for (const applicationId of applicationIds) {
    const pdf = await trcSummaryPdf(db, actor, applicationId, signal)
    if (!pdf.ok) continue
    await db.transaction(async (tx) => {
      const stored = await storeGeneratedBytes(tx, store, pdf.value, 'application/pdf', signal)
      await attachDocument(
        tx,
        actor,
        {
          target: { kind: 'application', id: applicationId },
          title: 'Technical Review Committee summary',
          docKind: 'board_material',
          file: {
            sha256: stored.sha256,
            filename: 'trc-summary.pdf',
            contentType: 'application/pdf',
          },
          audiences: ['board'],
          isPublic: false,
        },
        signal,
      )
    })
  }
  const owners = [
    and(eq(documents.recordKind, 'meeting'), eq(documents.recordId, meetingId)),
    ...(applicationIds.length === 0
      ? []
      : [
          and(eq(documents.recordKind, 'application'), inArray(documents.recordId, applicationIds)),
        ]),
  ]
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(or(...owners), BOARD_OR_PUBLIC))
    .orderBy(documents.seq)
  if (rows.length === 0) return err('empty')
  const made = await createPacket(
    db,
    actor,
    {
      title: `Meeting packet for ${formatCivilDate(meeting.meetingDate)}`,
      board: meeting.board,
      meetingDate: meeting.meetingDate as CivilDate,
      documentIds: rows.map((r) => r.id),
    },
    signal,
  )
  return made.ok ? ok({ packetId: made.value.packetId, documents: rows.length }) : made
}
