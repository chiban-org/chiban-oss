import type { BoardKind } from '@packs/nh/boardSchema'
import type { Db } from '@/db/client'
import { addAgendaItem, buildAgenda, publishAgenda } from '@/features/agendas/agendas'
import { createBoard } from '@/features/boards/boardAdmin'
import { scheduleMeeting } from '@/features/boards/meetings'
import { inviteBoardMember, type MemberTitle } from '@/features/boards/members'
import { recordMinutes } from '@/features/boards/minutes'
import { allBoards } from '@/features/boards/townBoards'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import { attachMinutes } from '@/features/demo/seedMinutes'
import { actorFor, type Cast, d, findApplication, must } from '@/features/demo/seedPermitSupport'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { addReviewComment } from '@/features/reviews/assignments'
import { assignBoardForComment } from '@/features/reviews/boardAssignments'
import type { ObjectStore } from '@/features/storage/objectStore'

const LOCATION = 'Alder Pond Town Hall, Meeting Room 1'

interface Seat {
  local: string
  name: string
  title: MemberTitle
}

const CONSERVATION_SEATS: readonly Seat[] = [
  { local: 'concom.member', name: 'Cleo Marsh', title: 'chair' },
  { local: 'concom.alder', name: 'Wren Alder', title: 'member' },
  { local: 'concom.pike', name: 'Hollis Pike', title: 'member' },
]

const HISTORIC_SEATS: readonly Seat[] = [
  { local: 'hdc.stone', name: 'Ada Stone', title: 'chair' },
  { local: 'hdc.rowe', name: 'Pru Rowe', title: 'member' },
  { local: 'hdc.vance', name: 'Otis Vance', title: 'member' },
]

const PAST_CONSERVATION_MEETING = '2026-10-07'
const UPCOMING_CONSERVATION_MEETING = '2026-11-18'
const UPCOMING_HISTORIC_MEETING = '2026-11-19'

const COMMENT_RECEIVED_APPLICATION = 'Barn conversion under appeal'
const COMMENT_WAITING_APPLICATION = 'Deck renewed once'

const CONSERVATION_COMMENT =
  'The barn sits close to the shoreland buffer. The commission asks that the plan show the buffer line, keep new lawn at least 50 feet back, and carry the erosion control notes onto the plan.'

async function addBoard(
  db: Db,
  cast: Cast,
  signal: AbortSignal,
  input: { kind: BoardKind; name: string; shortName: string },
): Promise<string> {
  return must(await createBoard(db, cast.admin, input, signal), `board ${input.name}`).boardId
}

async function seatMembers(
  db: Db,
  cast: Cast,
  boardId: string,
  seats: readonly Seat[],
  signal: AbortSignal,
) {
  for (const seat of seats) {
    must(
      await inviteBoardMember(
        db,
        createMemoryTransport(),
        cast.admin,
        {
          email: `${seat.local}@${DEMO_DOMAIN}`,
          displayName: seat.name,
          boardId,
          title: seat.title,
          termStart: d('2026-01-01'),
        },
        signal,
      ),
      `member ${seat.local}`,
    )
  }
}

async function schedule(db: Db, cast: Cast, boardId: string, date: string, signal: AbortSignal) {
  return must(
    await scheduleMeeting(
      db,
      cast.staff,
      { boardId, meetingDate: d(date), kind: 'regular', location: LOCATION },
      signal,
    ),
    `meeting ${date}`,
  ).meetingId
}

async function approveMinutes(
  db: Db,
  store: ObjectStore,
  cast: Cast,
  meetingId: string,
  signal: AbortSignal,
  now: Date,
) {
  const entry = {
    meetingDate: PAST_CONSERVATION_MEETING,
    approvedOn: '2026-10-21',
    body: 'Present: three members and the land use clerk. The commission walked the Heron Cove easement boundary, reviewed the spring trail maintenance schedule, and voted to renew the annual wetlands monitoring contract. Adjourned at 8:20 PM.',
  }
  const documentId = await attachMinutes(
    { db, store, signal, cast, now },
    meetingId,
    entry,
    'Conservation Commission',
  )
  must(
    await recordMinutes(
      db,
      cast.staff,
      { meetingId, documentId, status: 'approved', approvedOn: d(entry.approvedOn) },
      signal,
      now,
    ),
    'conservation minutes',
  )
}

async function showAgenda(
  db: Db,
  store: ObjectStore,
  cast: Cast,
  meetingId: string,
  signal: AbortSignal,
) {
  must(await buildAgenda(db, cast.staff, meetingId, signal), 'build conservation agenda')
  for (const item of [
    { kind: 'minutes_approval' as const, title: 'Approve the October 7 minutes' },
    { kind: 'business' as const, title: 'Comment on the barn conversion shoreland buffer' },
    { kind: 'other' as const, title: 'Trail easement update' },
  ]) {
    must(await addAgendaItem(db, cast.staff, { meetingId, ...item }, signal), item.title)
  }
  must(await publishAgenda(db, store, cast.staff, meetingId, signal), 'publish conservation agenda')
}

async function sendForComment(
  db: Db,
  cast: Cast,
  boardId: string,
  title: string,
  commentBy: string,
  signal: AbortSignal,
) {
  const applicationId = await findApplication(db, title)
  if (applicationId === null) return null
  return must(
    await assignBoardForComment(
      db,
      cast.staff,
      { applicationId, boardId, commentBy: d(commentBy) },
      signal,
    ),
    `send ${title}`,
  )
}

export async function seedTownBoards(
  db: Db,
  store: ObjectStore,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<boolean> {
  signal.throwIfAborted()
  const existing = await allBoards(db)
  if (existing.some((b) => b.kind === 'conservation_commission')) return false
  const cast: Cast = {
    admin: await actorFor(db, 'admin', signal),
    staff: await actorFor(db, 'staff', signal),
    applicant: await actorFor(db, 'applicant', signal),
  }
  const conservationId = await addBoard(db, cast, signal, {
    kind: 'conservation_commission',
    name: 'Alder Pond Conservation Commission',
    shortName: 'Conservation Commission',
  })
  const historicId = await addBoard(db, cast, signal, {
    kind: 'historic_district_commission',
    name: 'Alder Pond Historic District Commission',
    shortName: 'Historic District Commission',
  })
  await seatMembers(db, cast, conservationId, CONSERVATION_SEATS, signal)
  await seatMembers(db, cast, historicId, HISTORIC_SEATS, signal)
  const past = await schedule(db, cast, conservationId, PAST_CONSERVATION_MEETING, signal)
  const upcoming = await schedule(db, cast, conservationId, UPCOMING_CONSERVATION_MEETING, signal)
  await schedule(db, cast, historicId, UPCOMING_HISTORIC_MEETING, signal)
  await approveMinutes(db, store, cast, past, signal, now)
  await showAgenda(db, store, cast, upcoming, signal)
  const received = await sendForComment(
    db,
    cast,
    conservationId,
    COMMENT_RECEIVED_APPLICATION,
    '2026-11-20',
    signal,
  )
  await sendForComment(db, cast, conservationId, COMMENT_WAITING_APPLICATION, '2026-11-27', signal)
  if (received !== null) {
    const member = await actorFor(db, 'concom.member', signal)
    must(
      await addReviewComment(
        db,
        member,
        { assignmentId: received.assignmentId, body: CONSERVATION_COMMENT },
        signal,
      ),
      'conservation comment',
    )
  }
  return true
}
