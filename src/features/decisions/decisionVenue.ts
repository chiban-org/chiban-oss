import { and, eq, ne } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { boardDecisions, boardMeetings, boards, hearings } from '@/db/schema'
import type { ApplicationContext } from '@/features/applications/context'
import {
  classificationOfApplication,
  hearingIsOptional,
} from '@/features/decisions/hearingOptional'
import type { DecisionError, RecordDecisionInput } from '@/features/decisions/recordDecision'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface DecisionVenue {
  hearingId: string | null
  meetingId: string
  boardId: string | null
}

function voteTiming(
  hearing: { status: string; heldOn: string | null },
  votedOn: CivilDate,
): 'hearing_not_held' | 'before_meeting' | null {
  if (hearing.status !== 'held') return 'hearing_not_held'
  if (hearing.heldOn !== null && compareCivil(votedOn, hearing.heldOn as CivilDate) < 0) {
    return 'before_meeting'
  }
  return null
}

async function hearingVenue(
  tx: Tx,
  input: RecordDecisionInput,
  hearingId: string,
): Promise<Result<DecisionVenue, DecisionError>> {
  const [hearing] = await tx.select().from(hearings).where(eq(hearings.id, hearingId))
  if (hearing === undefined || hearing.applicationId !== input.applicationId)
    return err('not_found')
  const timing = voteTiming(hearing, input.votedOn)
  if (timing !== null) return err(timing)
  const [already] = await tx
    .select({ id: boardDecisions.id })
    .from(boardDecisions)
    .where(eq(boardDecisions.hearingId, hearing.id))
  if (already !== undefined) return err('invalid_state')
  const [meeting] = await tx
    .select({ boardId: boardMeetings.boardId })
    .from(boardMeetings)
    .where(eq(boardMeetings.id, hearing.meetingId))
  return ok({
    hearingId: hearing.id,
    meetingId: hearing.meetingId,
    boardId: meeting?.boardId ?? null,
  })
}

export function earliestDecisionDate(app: ApplicationContext): CivilDate | null {
  return app.completedDate ?? app.receivedDate
}

function datedTooEarly(
  app: ApplicationContext,
  votedOn: CivilDate,
): 'before_receipt' | 'before_acceptance' | null {
  if (app.receivedDate !== null && compareCivil(votedOn, app.receivedDate) < 0)
    return 'before_receipt'
  if (app.completedDate !== null && compareCivil(votedOn, app.completedDate) < 0)
    return 'before_acceptance'
  return null
}

export async function cancelScheduledHearings(tx: Tx, applicationId: string): Promise<string[]> {
  const cancelled = await tx
    .update(hearings)
    .set({ status: 'cancelled' })
    .where(and(eq(hearings.applicationId, applicationId), eq(hearings.status, 'scheduled')))
    .returning({ id: hearings.id })
  return cancelled.map((h) => h.id)
}

async function meetingVenue(
  tx: Tx,
  app: ApplicationContext,
  input: RecordDecisionInput,
): Promise<Result<DecisionVenue, DecisionError>> {
  const classification = classificationOfApplication(app)
  if (classification === undefined || !hearingIsOptional(classification))
    return err('hearing_required')
  if (input.meetingId === undefined) return err('meeting_required')
  const [meeting] = await tx
    .select({
      id: boardMeetings.id,
      boardId: boardMeetings.boardId,
      meetingDate: boardMeetings.meetingDate,
      status: boardMeetings.status,
      kind: boards.kind,
    })
    .from(boardMeetings)
    .innerJoin(boards, eq(boards.id, boardMeetings.boardId))
    .where(eq(boardMeetings.id, input.meetingId))
  if (
    meeting === undefined ||
    meeting.status !== 'scheduled' ||
    meeting.kind !== classification.boardKind
  )
    return err('not_found')
  if (compareCivil(input.votedOn, meeting.meetingDate as CivilDate) < 0)
    return err('before_meeting')
  const early = datedTooEarly(app, input.votedOn)
  if (early !== null) return err(early)
  const meetingEarly = datedTooEarly(app, meeting.meetingDate as CivilDate)
  if (meetingEarly !== null) return err({ meetingBefore: meetingEarly })
  const [already] = await tx
    .select({ id: boardDecisions.id })
    .from(boardDecisions)
    .where(
      and(
        eq(boardDecisions.applicationId, input.applicationId),
        ne(boardDecisions.outcome, 'rehearing_granted'),
      ),
    )
  if (already !== undefined) return err('invalid_state')
  return ok({ hearingId: null, meetingId: meeting.id, boardId: meeting.boardId })
}

export async function resolveVenue(
  tx: Tx,
  app: ApplicationContext,
  input: RecordDecisionInput,
): Promise<Result<DecisionVenue, DecisionError>> {
  if (input.hearingId !== null) return await hearingVenue(tx, input, input.hearingId)
  return await meetingVenue(tx, app, input)
}
