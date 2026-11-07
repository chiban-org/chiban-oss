import type { BoardKind } from '@packs/nh/schema'
import { and, eq, inArray } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { acceptanceSchedules, applications, clocks, completenessVotes } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import {
  setSubstep,
  type TransitionError,
  transitionApplication,
} from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication, declaresSubstep } from '@/features/boards/boardOf'
import { nextRegularMeetingOfBoard } from '@/features/boards/calendar'
import { FILING_LEAD_KEY, filingLeadFor, filingLeadRule } from '@/features/boards/filingLead'
import { getMeeting } from '@/features/boards/meetings'
import { boardForKind } from '@/features/boards/townBoards'
import { factsWithDeterminations } from '@/features/clocks/derivedFacts'
import { createClock, markClockMet, startClocksFor } from '@/features/clocks/startClocks'
import type { GateResult } from '@/features/gates/evaluateGates'
import { loadPack } from '@/features/packs/loadPack'
import { addDays, type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const ACCEPTANCE_CHANGED = 'acceptance_meeting_changed'

export type AcceptanceError =
  | 'forbidden'
  | 'not_found'
  | 'not_submitted'
  | 'wrong_board'
  | 'meeting_cancelled'
  | { noBoard: BoardKind }
  | { filedTooLate: { lastFilingDay: CivilDate; earliestMeeting: CivilDate | null } }

async function replaceFilingClock(
  tx: Tx,
  input: {
    applicationId: string
    meetingDate: CivilDate
    receivedDate: CivilDate
    leadDays: number
    facts: Awaited<ReturnType<typeof factsWithDeterminations>>
  },
  signal: AbortSignal,
): Promise<void> {
  const { rule, packDays } = filingLeadRule()
  const previous = await tx
    .select({ id: clocks.id })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, input.applicationId),
        eq(clocks.ruleKey, FILING_LEAD_KEY),
        inArray(clocks.status, ['running', 'overdue', 'met']),
      ),
    )
  const freshId = await createClock(
    tx,
    {
      applicationId: input.applicationId,
      rule,
      facts: input.facts,
      event: 'acceptance_meeting_set',
      onDate: input.meetingDate,
      pack: loadPack(),
      lengthOverrideDays: input.leadDays === packDays ? undefined : input.leadDays,
    },
    signal,
  )
  for (const old of previous) {
    await tx
      .update(clocks)
      .set({ status: 'superseded', supersededBy: freshId, supersededReason: ACCEPTANCE_CHANGED })
      .where(eq(clocks.id, old.id))
  }
  await markClockMet(tx, input.applicationId, FILING_LEAD_KEY, input.receivedDate, signal)
}

export async function setAcceptanceMeetingTx(
  tx: Tx,
  actor: Actor,
  input: { applicationId: string; meetingId: string },
  signal: AbortSignal,
): Promise<Result<{ lastFilingDay: CivilDate | null }, AcceptanceError>> {
  signal.throwIfAborted()
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
  if (app.state !== 'submitted' || app.receivedDate === null) return err('not_submitted')
  const meeting = await getMeeting(tx, input.meetingId, signal)
  if (meeting === null) return err('not_found')
  if (meeting.boardKind !== boardKind) return err('wrong_board')
  if (meeting.status === 'cancelled') return err('meeting_cancelled')
  const meetingDate = meeting.meetingDate as CivilDate
  let lastFilingDay: CivilDate | null = null
  const lead = await filingLeadFor(tx, app, meeting.boardId, signal)
  if (lead !== null) {
    const { leadDays } = lead
    lastFilingDay = lead.lastFilingDay(meetingDate)
    if (compareCivil(app.receivedDate, lastFilingDay) > 0) {
      const earliestMeeting = await nextRegularMeetingOfBoard(
        tx,
        meeting.boardId,
        addDays(app.receivedDate, leadDays),
        signal,
      )
      return err({ filedTooLate: { lastFilingDay, earliestMeeting } })
    }
    await replaceFilingClock(
      tx,
      {
        applicationId: app.id,
        meetingDate,
        receivedDate: app.receivedDate,
        leadDays,
        facts: await factsWithDeterminations(tx, app.id, app.facts),
      },
      signal,
    )
  }
  const values = {
    applicationId: app.id,
    meetingId: meeting.id,
    setBy: actor.userId,
    setAt: new Date(),
  }
  await tx
    .insert(acceptanceSchedules)
    .values(values)
    .onConflictDoUpdate({ target: acceptanceSchedules.applicationId, set: values })
  if (declaresSubstep(app, 'submitted', 'acceptance_scheduled')) {
    const moved = await setSubstep(
      tx,
      actor,
      {
        applicationId: app.id,
        substep: 'acceptance_scheduled',
        expectedRowVersion: app.rowVersion,
      },
      signal,
    )
    if (!moved.ok) return err('not_submitted')
  }
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'board.acceptance_meeting.set',
      entityType: 'application',
      entityId: app.id,
      after: { meetingId: meeting.id, meetingDate, lastFilingDay },
    },
    signal,
  )
  return ok({ lastFilingDay })
}

export async function setAcceptanceMeeting(
  db: Db,
  actor: Actor,
  input: { applicationId: string; meetingId: string },
  signal: AbortSignal,
): Promise<Result<{ lastFilingDay: CivilDate | null }, AcceptanceError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<{ lastFilingDay: CivilDate | null }, AcceptanceError>(db, (tx) =>
    setAcceptanceMeetingTx(tx, actor, input, signal),
  )
}

export { recordCompletenessVote, type VoteError } from '@/features/boards/completenessVote'
