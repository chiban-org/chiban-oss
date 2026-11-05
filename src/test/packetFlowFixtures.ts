import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { documents } from '@/db/schema'
import { buildAgenda, publishAgenda } from '@/features/agendas/agendas'
import { type Actor, loadActor } from '@/features/auth/actor'
import { inviteBoardMember } from '@/features/boards/members'
import type { Audience } from '@/features/documents/types'
import { scheduleHearing } from '@/features/hearings/hearings'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import type { ObjectStore } from '@/features/storage/objectStore'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
export const FLOW_MEETING = '2027-04-15'

export interface PacketFlow {
  world: BoardWorld
  meetingId: string
  applicationId: string
  agendaDocumentId: string
}

async function zbaMeetingId(db: Db): Promise<string> {
  const rows = await db.query.boardMeetings.findMany({
    where: (m, { and, eq: equals }) =>
      and(equals(m.meetingDate, FLOW_MEETING), equals(m.board, 'zba')),
  })
  return rows[0]?.id ?? ''
}

export async function packetFlow(db: Db, store: ObjectStore): Promise<PacketFlow> {
  const world = await setupBoardWorld(db, { zbaMeetings: [FLOW_MEETING] })
  const applicationId = await submitBoardApplication(db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(db, world, applicationId)
  await issueListWithRecipients(db, world, applicationId, [recipient(1)])
  const meetingId = await zbaMeetingId(db)
  const scheduled = await scheduleHearing(
    db,
    world.staff,
    { applicationId, meetingId, kind: 'public_hearing' },
    signal,
  )
  if (!scheduled.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'hearing not scheduled')
  await buildAgenda(db, world.staff, meetingId, signal)
  const published = await publishAgenda(db, store, world.staff, meetingId, signal)
  if (!published.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'agenda not published')
  return { world, meetingId, applicationId, agendaDocumentId: published.value.documentId }
}

export async function applicationDocument(
  db: Db,
  store: ObjectStore,
  flow: PacketFlow,
  doc: { title: string; audiences: Audience[]; isPublic?: boolean },
): Promise<string> {
  const { title } = doc
  const up = await uploadAs(
    db,
    store,
    flow.world.staff,
    { kind: 'application', id: flow.applicationId },
    pdfBytes(`${title} ${Math.random()}`),
    { title },
  )
  await db
    .update(documents)
    .set({ audiences: doc.audiences, isPublic: doc.isPublic ?? false })
    .where(eq(documents.id, up.documentId))
  return up.documentId
}

export async function seatedMember(db: Db, flow: PacketFlow, email: string): Promise<Actor> {
  const invited = await inviteBoardMember(
    db,
    createMemoryTransport(),
    flow.world.staff,
    {
      email,
      displayName: 'Seated Member',
      board: 'zba',
      title: 'member',
      termStart: '2020-01-01' as CivilDate,
    },
    signal,
  )
  if (!invited.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'member not invited')
  const actor = await loadActor(db, invited.value.userId, signal)
  if (actor === null) throw new AppError(ErrorIds.DB_INVARIANT, 'member not loaded')
  return actor
}
