import { asc, eq } from 'drizzle-orm'
import type { GraphNode } from '@/components/appeals/AppealGraph'
import type { Db } from '@/db/client'
import { boardDecisions, boardMeetings, hearings } from '@/db/schema'
import { packWaitsForFinalApproval } from '@/features/appeals/projectFinality'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import { TERMINAL_STATES } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { type MeetingEligibility, meetingEligibility } from '@/features/boards/meetingEligibility'
import { boardForKind } from '@/features/boards/townBoards'
import { toGraphNodes } from '@/features/decisions/decisionView'
import {
  classificationOfApplication,
  hearingIsOptional,
} from '@/features/decisions/hearingOptional'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { seatedMemberNames } from '@/features/decisions/seatedVoters'
import { HEARING_KIND_LABELS } from '@/features/hearings/labels'
import { hearingText, loadApplicationAppealNodes } from '@/features/hearings/views'
import { type TrcDepartmentSummary, trcSummary } from '@/features/reviews/trcSummary'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export interface NoHearingDecisionForm {
  meetings: { id: string; text: string }[]
  seatedMembers: string[]
  today: string
  offerFinalApproval: boolean
}

export interface ApplicationHearingsPanel {
  applicationId: string
  canRecord: boolean
  canRoute: boolean
  canSchedule: boolean
  scheduleMeetings: ({ id: string; date: string; text: string } & MeetingEligibility)[]
  scheduleKinds: [string, string][]
  hearings: { id: string; text: string }[]
  decisions: { id: string; text: string }[]
  noHearing: NoHearingDecisionForm | null
  graph: GraphNode[]
  trc: TrcDepartmentSummary[]
}

async function noHearingForm(
  db: Db,
  app: ApplicationContext,
  ctx: {
    boardId: string | null
    meetings: { id: string; meetingDate: string; status: string }[]
    today: CivilDate
    decisions: { outcome: string }[]
    signal: AbortSignal
  },
): Promise<NoHearingDecisionForm | null> {
  if (!hearingIsOptional(classificationOfApplication(app)) || app.state !== 'under_review')
    return null
  if (ctx.boardId === null) return null
  if (ctx.decisions.some((d) => d.outcome !== 'rehearing_granted')) return null
  const past = ctx.meetings.filter((m) => m.status === 'scheduled' && m.meetingDate <= ctx.today)
  return {
    meetings: past.map((m) => ({ id: m.id, text: formatCivilDate(m.meetingDate) })).reverse(),
    seatedMembers: await seatedMemberNames(db, ctx.boardId, ctx.today),
    today: ctx.today,
    offerFinalApproval: packWaitsForFinalApproval(),
  }
}

export async function loadApplicationHearingsPanel(
  db: Db,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<ApplicationHearingsPanel | null> {
  signal.throwIfAborted()
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return null
  const boardKind = boardOfApplication(app)
  if (boardKind === null) return null
  const boardRow = await boardForKind(db, boardKind, signal)
  const canRecord = await hasCapability(db, actor.userId, 'board.record', signal)
  if (!canRecord) return null
  const finished = TERMINAL_STATES.includes(app.state)
  const canRoute = !finished && (await hasCapability(db, actor.userId, 'review.assign', signal))
  const today = await townToday(db, new Date(), signal)
  const meetings =
    boardRow === null
      ? []
      : await db
          .select()
          .from(boardMeetings)
          .where(eq(boardMeetings.boardId, boardRow.id))
          .orderBy(asc(boardMeetings.meetingDate))
  const held = await db
    .select({ hearing: hearings, meeting: boardMeetings })
    .from(hearings)
    .innerJoin(boardMeetings, eq(boardMeetings.id, hearings.meetingId))
    .where(eq(hearings.applicationId, applicationId))
    .orderBy(asc(boardMeetings.meetingDate))
  const decisions = await db
    .select()
    .from(boardDecisions)
    .where(eq(boardDecisions.applicationId, applicationId))
    .orderBy(asc(boardDecisions.votedOn))
  const summary = await trcSummary(db, actor, applicationId, signal)
  const eligible = await meetingEligibility(db, app, boardRow?.id ?? '', today, signal)
  const kinds: [string, string][] =
    app.state === 'submitted' && boardKind === 'planning_board'
      ? [['submission_and_hearing', HEARING_KIND_LABELS.submission_and_hearing]]
      : [
          ['public_hearing', HEARING_KIND_LABELS.public_hearing],
          ['rehearing', HEARING_KIND_LABELS.rehearing],
        ]
  const noHearing = await noHearingForm(db, app, {
    boardId: boardRow?.id ?? null,
    meetings,
    today,
    decisions,
    signal,
  })
  return {
    applicationId,
    canRecord,
    canRoute,
    canSchedule: !finished,
    scheduleMeetings: meetings
      .filter((m) => m.status === 'scheduled' && m.meetingDate >= today)
      .map((m) => ({
        id: m.id,
        date: m.meetingDate,
        text: formatCivilDate(m.meetingDate),
        ...eligible(m),
      })),
    scheduleKinds: kinds,
    hearings: held.map(({ hearing, meeting }) => ({
      id: hearing.id,
      text: hearingText(hearing.kind, meeting.meetingDate, hearing.status),
    })),
    decisions: decisions.map((d) => ({
      id: d.id,
      text: `${OUTCOME_LABELS[d.outcome]}, voted ${formatCivilDate(d.votedOn)}`,
    })),
    noHearing,
    graph: await toGraphNodes(db, await loadApplicationAppealNodes(db, applicationId), signal),
    trc: summary.ok ? summary.value : [],
  }
}
