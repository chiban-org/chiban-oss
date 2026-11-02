import { asc, eq } from 'drizzle-orm'
import type { GraphNode } from '@/components/appeals/AppealGraph'
import type { Db } from '@/db/client'
import { boardDecisions, boardMeetings, hearings } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { toGraphNodes } from '@/features/decisions/decisionView'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { HEARING_KIND_LABELS } from '@/features/hearings/labels'
import { HEARING_STATUS_LABELS, loadApplicationAppealNodes } from '@/features/hearings/views'
import { type TrcDepartmentSummary, trcSummary } from '@/features/reviews/trcSummary'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'

export interface ApplicationHearingsPanel {
  applicationId: string
  canRecord: boolean
  canRoute: boolean
  scheduleMeetings: { id: string; text: string }[]
  scheduleKinds: [string, string][]
  hearings: { id: string; text: string }[]
  decisions: { id: string; text: string }[]
  graph: GraphNode[]
  trc: TrcDepartmentSummary[]
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
  const board = boardOfApplication(app)
  if (board === null) return null
  const canRecord = await hasCapability(db, actor.userId, 'board.record', signal)
  if (!canRecord) return null
  const canRoute = await hasCapability(db, actor.userId, 'review.assign', signal)
  const today = await townToday(db, new Date(), signal)
  const meetings = await db
    .select()
    .from(boardMeetings)
    .where(eq(boardMeetings.board, board))
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
  const kinds: [string, string][] =
    app.state === 'submitted' && board === 'planning_board'
      ? [['submission_and_hearing', HEARING_KIND_LABELS.submission_and_hearing]]
      : [
          ['public_hearing', HEARING_KIND_LABELS.public_hearing],
          ['rehearing', HEARING_KIND_LABELS.rehearing],
        ]
  return {
    applicationId,
    canRecord,
    canRoute,
    scheduleMeetings: meetings
      .filter((m) => m.status === 'scheduled' && m.meetingDate >= today)
      .map((m) => ({ id: m.id, text: formatCivilDate(m.meetingDate) })),
    scheduleKinds: kinds,
    hearings: held.map(({ hearing, meeting }) => ({
      id: hearing.id,
      text: `${HEARING_KIND_LABELS[hearing.kind]}, ${formatCivilDate(meeting.meetingDate)}. ${HEARING_STATUS_LABELS[hearing.status]}.`,
    })),
    decisions: decisions.map((d) => ({
      id: d.id,
      text: `${OUTCOME_LABELS[d.outcome]}, voted ${formatCivilDate(d.votedOn)}`,
    })),
    graph: toGraphNodes(await loadApplicationAppealNodes(db, applicationId)),
    trc: summary.ok ? summary.value : [],
  }
}
