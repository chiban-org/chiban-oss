import { randomUUID } from 'node:crypto'
import type { BoardKind } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { applications, hearings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { setSubstep, transitionApplication } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { type AcceptanceError, setAcceptanceMeetingTx } from '@/features/boards/acceptance'
import { boardOfApplication, declaresSubstep } from '@/features/boards/boardOf'
import { getMeeting } from '@/features/boards/meetings'
import { boardForKind } from '@/features/boards/townBoards'
import { markClockMet, startClocksFor } from '@/features/clocks/startClocks'
import type { GateResult } from '@/features/gates/evaluateGates'
import { deriveNoticeItems } from '@/features/notices/deriveItems'
import { type NoticeStatusItem, noticeStatus } from '@/features/notices/noticeStatus'
import { isAfterTownToday, townToday } from '@/features/town/today'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type HearingKind = 'submission_and_hearing' | 'public_hearing' | 'rehearing'

export type ScheduleError =
  | 'forbidden'
  | 'not_found'
  | 'wrong_board'
  | 'not_submitted'
  | 'meeting_cancelled'
  | 'invalid_state'
  | 'no_issued_list'
  | 'determination_missing'
  | 'list_out_of_date'
  | { noBoard: BoardKind }
  | { filedTooLate: { lastFilingDay: CivilDate; earliestMeeting: CivilDate | null } }
  | { gateBlocked: GateResult[] }

async function openZbaHearing(
  tx: Tx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<Result<void, ScheduleError>> {
  const app = await loadApplicationContext(tx, applicationId, signal)
  if (app === null) return err('not_found')
  const today = await townToday(tx, new Date(), signal)
  const moved = await transitionApplication(
    tx,
    actor,
    {
      applicationId,
      to: 'under_review',
      boardVote: true,
      expectedRowVersion: app.rowVersion,
      onDate: today,
    },
    signal,
  )
  if (!moved.ok) {
    return err(typeof moved.error === 'string' ? 'invalid_state' : moved.error)
  }
  await tx
    .update(applications)
    .set({ completedDate: today })
    .where(eq(applications.id, applicationId))
  if (declaresSubstep(app, 'under_review', 'hearing')) {
    const stepped = await setSubstep(
      tx,
      actor,
      { applicationId, substep: 'hearing', expectedRowVersion: moved.value.rowVersion },
      signal,
    )
    if (!stepped.ok) return err('invalid_state')
  }
  await startClocksFor(tx, applicationId, 'application_accepted', today, signal)
  return ok(undefined)
}

function acceptanceFailure(error: AcceptanceError): ScheduleError {
  if (error === 'not_submitted' || error === 'meeting_cancelled') return error
  return error
}

async function bringToHearing(
  tx: Tx,
  actor: Actor,
  input: { applicationId: string; meetingId: string; kind: HearingKind },
  state: string,
  boardKind: BoardKind,
  signal: AbortSignal,
): Promise<Result<void, ScheduleError>> {
  if (state === 'under_review') {
    return input.kind === 'submission_and_hearing' ? err('invalid_state') : ok(undefined)
  }
  if (state !== 'submitted') return err('invalid_state')
  if (boardKind === 'zba') return await openZbaHearing(tx, actor, input.applicationId, signal)
  if (input.kind !== 'submission_and_hearing') return err('invalid_state')
  const set = await setAcceptanceMeetingTx(tx, actor, input, signal)
  return set.ok ? ok(undefined) : err(acceptanceFailure(set.error))
}

export async function scheduleHearing(
  db: Db,
  actor: Actor,
  input: { applicationId: string; meetingId: string; kind: HearingKind },
  signal: AbortSignal,
): Promise<Result<{ hearingId: string }, ScheduleError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<{ hearingId: string }, ScheduleError>(db, async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    const boardKind = boardOfApplication(app)
    if (boardKind === null) return err('wrong_board')
    if ((await boardForKind(tx, boardKind, signal)) === null) return err({ noBoard: boardKind })
    const meeting = await getMeeting(tx, input.meetingId, signal)
    if (meeting === null) return err('not_found')
    if (meeting.boardKind !== boardKind) return err('wrong_board')
    if (meeting.status === 'cancelled') return err('meeting_cancelled')
    const hearingId = randomUUID()
    const derived = await deriveNoticeItems(
      tx,
      {
        subjectKind: 'hearing',
        subjectId: hearingId,
        applicationId: app.id,
        anchorDate: meeting.meetingDate as CivilDate,
      },
      signal,
    )
    if (!derived.ok) return err(derived.error)
    const brought = await bringToHearing(tx, actor, input, app.state, boardKind, signal)
    if (!brought.ok) return brought
    await tx.insert(hearings).values({
      id: hearingId,
      applicationId: app.id,
      meetingId: meeting.id,
      kind: input.kind,
      noticeSetId: derived.value.setId,
      createdBy: actor.userId,
    })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'hearing.schedule',
        entityType: 'application',
        entityId: app.id,
        after: { hearingId, meetingId: meeting.id, kind: input.kind },
      },
      signal,
    )
    return ok({ hearingId })
  })
}

export async function markProperlyNoticed(
  db: Db,
  actor: Actor,
  hearingId: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, 'forbidden' | 'not_found' | { notProperlyNoticed: NoticeStatusItem[] }>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<
    void,
    'forbidden' | 'not_found' | { notProperlyNoticed: NoticeStatusItem[] }
  >(db, async (tx) => {
    const [hearing] = await tx
      .select()
      .from(hearings)
      .where(eq(hearings.id, hearingId))
      .for('update')
    if (hearing === undefined) return err('not_found')
    const status = await noticeStatus(tx, hearing.noticeSetId, signal)
    if (!status.properlyNoticed) {
      return err({ notProperlyNoticed: status.items.filter((i) => i.state !== 'proved_on_time') })
    }
    await tx
      .update(hearings)
      .set({ properlyNoticedAt: now, properlyNoticedBy: actor.userId })
      .where(eq(hearings.id, hearingId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'hearing.properly_noticed',
        entityType: 'application',
        entityId: hearing.applicationId,
        after: { hearingId },
      },
      signal,
    )
    return ok(undefined)
  })
}

export type HeldError =
  | 'forbidden'
  | 'not_found'
  | 'not_properly_noticed'
  | 'before_meeting'
  | 'future_date'

export async function markHearingHeld(
  db: Db,
  actor: Actor,
  input: { hearingId: string; heldOn: CivilDate },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, HeldError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  if (await isAfterTownToday(db, input.heldOn, now, signal)) return err('future_date')
  return await transactionResult<void, HeldError>(db, async (tx) => {
    const [hearing] = await tx
      .select()
      .from(hearings)
      .where(eq(hearings.id, input.hearingId))
      .for('update')
    if (hearing === undefined) return err('not_found')
    if (hearing.status !== 'scheduled' || hearing.properlyNoticedAt === null) {
      return err('not_properly_noticed')
    }
    const status = await noticeStatus(tx, hearing.noticeSetId, signal)
    if (!status.properlyNoticed) return err('not_properly_noticed')
    const meeting = await getMeeting(tx, hearing.meetingId, signal)
    if (meeting !== null && compareCivil(input.heldOn, meeting.meetingDate as CivilDate) < 0) {
      return err('before_meeting')
    }
    await tx
      .update(hearings)
      .set({ status: 'held', heldOn: input.heldOn })
      .where(eq(hearings.id, hearing.id))
    const app = await loadApplicationContext(tx, hearing.applicationId, signal)
    if (app !== null && boardOfApplication(app) === 'zba') {
      await markClockMet(tx, app.id, 'nh.zba.hearing', input.heldOn, signal)
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'hearing.held',
        entityType: 'application',
        entityId: hearing.applicationId,
        after: { hearingId: hearing.id, heldOn: input.heldOn },
      },
      signal,
    )
    return ok(undefined)
  })
}
