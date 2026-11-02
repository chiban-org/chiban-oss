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
import { createClock, markClockMet, startClocksFor } from '@/features/clocks/startClocks'
import { effectiveBindings } from '@/features/config/bindings'
import type { GateResult } from '@/features/gates/evaluateGates'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { addDays, type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const FILING_LEAD_KEY = 'nh.pb.filing_lead'
export const COMPLETENESS_KEY = 'nh.pb.completeness'
export const ACCEPTANCE_CHANGED = 'acceptance_meeting_changed'

export type AcceptanceError =
  | 'forbidden'
  | 'not_found'
  | 'not_submitted'
  | 'wrong_board'
  | 'meeting_cancelled'
  | { filedTooLate: { lastFilingDay: CivilDate; earliestMeeting: CivilDate | null } }

function filingLeadRule() {
  const rule = ruleByKey(loadPack(), FILING_LEAD_KEY)
  if (rule.kind !== 'clock' || !('value' in rule.length)) {
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'nh.pb.filing_lead must be a plain clock')
  }
  return { rule, packDays: rule.length.value }
}

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

export async function setAcceptanceMeeting(
  db: Db,
  actor: Actor,
  input: { applicationId: string; meetingId: string },
  signal: AbortSignal,
): Promise<Result<{ lastFilingDay: CivilDate | null }, AcceptanceError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<{ lastFilingDay: CivilDate | null }, AcceptanceError>(
    db,
    async (tx) => {
      await tx
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.id, input.applicationId))
        .for('update')
      const app = await loadApplicationContext(tx, input.applicationId, signal)
      if (app === null) return err('not_found')
      const board = boardOfApplication(app)
      if (board === null) return err('wrong_board')
      if (app.state !== 'submitted' || app.receivedDate === null) return err('not_submitted')
      const meeting = await getMeeting(tx, input.meetingId, signal)
      if (meeting === null) return err('not_found')
      if (meeting.board !== board) return err('wrong_board')
      if (meeting.status === 'cancelled') return err('meeting_cancelled')
      const meetingDate = meeting.meetingDate as CivilDate
      let lastFilingDay: CivilDate | null = null
      const bound = effectiveBindings(app.typeBody, loadPack()).includes(FILING_LEAD_KEY)
      if (bound) {
        const { rule, packDays } = filingLeadRule()
        const settings = await getBoardSettings(tx, signal)
        const leadDays = settings.boards.find((b) => b.board === board)?.filingLeadDays ?? packDays
        lastFilingDay = computeRuleDue(
          rule,
          { unit: 'days', value: leadDays },
          meetingDate,
          packHolidayCalendar(),
        ).due
        if (compareCivil(app.receivedDate, lastFilingDay) > 0) {
          const earliestMeeting = await nextRegularMeeting(
            tx,
            board,
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
    },
  )
}

export type VoteError =
  | 'forbidden'
  | 'not_found'
  | 'wrong_board'
  | 'reason_required'
  | 'not_submitted'
  | 'invalid_state'
  | { gateBlocked: GateResult[] }

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
    const meeting = await getMeeting(tx, input.meetingId, signal)
    if (meeting === null) return err('not_found')
    if (meeting.board !== board) return err('wrong_board')
    await markClockMet(tx, app.id, COMPLETENESS_KEY, input.votedOn, signal)
    const moved = await transitionApplication(
      tx,
      actor,
      input.outcome === 'accepted'
        ? {
            applicationId: app.id,
            to: 'under_review',
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
