import type { Board } from '@packs/nh/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
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
import { getBoardSettings } from '@/features/boards/boardSettings'
import { nextRegularMeeting } from '@/features/boards/calendar'
import { getMeeting } from '@/features/boards/meetings'
import { factsWithDeterminations } from '@/features/clocks/derivedFacts'
import { computeRuleDue } from '@/features/clocks/ruleEngine'
import {
  createClock,
  markClockMet,
  resolveClockLength,
  startClocksFor,
} from '@/features/clocks/startClocks'
import { effectiveBindings } from '@/features/config/bindings'
import type { GateResult } from '@/features/gates/evaluateGates'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { addDays, type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const COMPLETENESS_KEY = 'nh.pb.completeness'

export type VoteError =
  | 'forbidden'
  | 'not_found'
  | 'wrong_board'
  | 'meeting_not_set'
  | 'reason_required'
  | 'not_submitted'
  | 'invalid_state'
  | { gateBlocked: GateResult[] }

async function checkVoteMeeting(
  tx: Tx,
  applicationId: string,
  board: Board,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<NonNullable<Awaited<ReturnType<typeof getMeeting>>>, VoteError>> {
  const meeting = await getMeeting(tx, meetingId, signal)
  if (meeting === null) return err('not_found')
  if (meeting.board !== board) return err('wrong_board')
  const [scheduled] = await tx
    .select({ meetingId: acceptanceSchedules.meetingId })
    .from(acceptanceSchedules)
    .where(eq(acceptanceSchedules.applicationId, applicationId))
  return scheduled?.meetingId === meeting.id ? ok(meeting) : err('meeting_not_set')
}

function voteErrorFrom(error: TransitionError): VoteError {
  if (typeof error !== 'string') return error
  if (error === 'forbidden' || error === 'not_found') return error
  return 'invalid_state'
}

export async function recordCompletenessVote(
  db: Db,
  actor: Actor,
  input: {
    applicationId: string
    meetingId: string
    votedOn: CivilDate
    outcome: 'accepted' | 'not_accepted'
    reason?: string
  },
  signal: AbortSignal,
): Promise<Result<void, VoteError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  const reason = input.reason?.trim() ?? ''
  if (input.outcome === 'not_accepted' && reason === '') return err('reason_required')
  return await transactionResult<void, VoteError>(db, async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    const board = boardOfApplication(app)
    if (board === null) return err('wrong_board')
    if (app.state !== 'submitted') return err('not_submitted')
    const checked = await checkVoteMeeting(tx, app.id, board, input.meetingId, signal)
    if (!checked.ok) return checked
    const meeting = checked.value
    await markClockMet(tx, app.id, COMPLETENESS_KEY, input.votedOn, signal)
    if (board === 'zba') await markClockMet(tx, app.id, 'nh.zba.hearing', input.votedOn, signal)
    const moved = await transitionApplication(
      tx,
      actor,
      input.outcome === 'accepted'
        ? {
            applicationId: app.id,
            to: 'under_review',
            boardVote: true,
            expectedRowVersion: app.rowVersion,
            onDate: input.votedOn,
          }
        : {
            applicationId: app.id,
            to: 'denied',
            expectedRowVersion: app.rowVersion,
            onDate: input.votedOn,
            closureReason: 'not_accepted_incomplete',
          },
      signal,
    )
    if (!moved.ok) return err(voteErrorFrom(moved.error))
    await tx.insert(completenessVotes).values({
      applicationId: app.id,
      meetingId: meeting.id,
      votedOn: input.votedOn,
      outcome: input.outcome,
      reason: reason === '' ? null : reason,
      recordedBy: actor.userId,
    })
    if (input.outcome === 'accepted') {
      await tx
        .update(applications)
        .set({ completedDate: input.votedOn })
        .where(eq(applications.id, app.id))
      if (declaresSubstep(app, 'under_review', 'hearing')) {
        const stepped = await setSubstep(
          tx,
          actor,
          { applicationId: app.id, substep: 'hearing', expectedRowVersion: moved.value.rowVersion },
          signal,
        )
        if (!stepped.ok) return err('invalid_state')
      }
      await startClocksFor(tx, app.id, 'application_accepted', input.votedOn, signal)
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: `board.completeness.${input.outcome}`,
        entityType: 'application',
        entityId: app.id,
        after: {
          meetingId: meeting.id,
          votedOn: input.votedOn,
          reason: reason === '' ? null : reason,
        },
      },
      signal,
    )
    return ok(undefined)
  })
}
