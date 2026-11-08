import { BOARD_KIND_TRAITS, type BoardKind } from '@packs/nh/schema'
import { and, asc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  acceptanceSchedules,
  applications,
  boardMeetings,
  projects,
  reviewAssignments,
} from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { stateLabel } from '@/features/applications/stateLabel'
import { type CoreState, TERMINAL_STATES } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { activeBoards, boardLabel } from '@/features/boards/townBoards'
import { headlineDeadline } from '@/features/queue/headlineDeadline'
import { DEADLINE_OPEN, NEXT_DUE, NEXT_DUE_RULE_KEY, NOTICE_DUE } from '@/features/queue/queueSql'
import { boardReviewStatusLabel } from '@/features/reviews/statusLabels'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'

export interface MeetingLine {
  id: string
  dateText: string
  kindText: string
  location: string
  cancelled: boolean
  cancelReason: string | null
  past: boolean
}

export interface BoardApplicationLine {
  id: string
  number: string
  typeLabel: string
  stateText: string
  filedText: string
  meetingText: string | null
  deadlineText: string | null
  typeKey: string
  state: CoreState
  filedOn: string | null
  meetingOn: string | null
  deadlineOn: string | null
  deadlineOverdue: boolean
}

export interface CommentRequestLine {
  applicationId: string
  number: string
  title: string
  statusLabel: string
  commentByText: string | null
}

export interface BoardSection {
  boardId: string
  boardKind: BoardKind
  label: string
  meetings: MeetingLine[]
  applications: BoardApplicationLine[]
  commentRequests: CommentRequestLine[]
}

export interface BoardsView {
  today: string
  sections: BoardSection[]
}

const OPEN_STATES: CoreState[] = ['submitted', 'under_review', 'decided']

async function applicationLines(
  db: Db,
  boardKind: BoardKind,
  today: string,
  signal: AbortSignal,
): Promise<BoardApplicationLine[]> {
  if (!BOARD_KIND_TRAITS[boardKind].decidesApplications) return []
  const rows = await db
    .select({
      row: applications,
      clockDue: NEXT_DUE,
      clockRuleKey: NEXT_DUE_RULE_KEY,
      noticeDue: NOTICE_DUE,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(
      or(
        inArray(applications.state, OPEN_STATES),
        and(ne(applications.state, 'draft'), DEADLINE_OPEN),
      ),
    )
    .orderBy(asc(applications.receivedDate))
  const lines: BoardApplicationLine[] = []
  for (const { row, clockDue, clockRuleKey, noticeDue } of rows) {
    const app = await loadApplicationContext(db, row.id, signal)
    if (app === null || boardOfApplication(app) !== boardKind) continue
    const [schedule] = await db
      .select({ date: boardMeetings.meetingDate })
      .from(acceptanceSchedules)
      .innerJoin(boardMeetings, eq(boardMeetings.id, acceptanceSchedules.meetingId))
      .where(eq(acceptanceSchedules.applicationId, row.id))
    const deadline = headlineDeadline(clockDue, clockRuleKey, noticeDue)
    const deadlineOverdue = deadline !== null && deadline.on < today
    lines.push({
      typeKey: row.applicationTypeKey,
      state: app.state,
      filedOn: row.receivedDate,
      meetingOn: schedule?.date ?? null,
      deadlineOn: deadline?.on ?? null,
      deadlineOverdue,
      id: row.id,
      number: row.number,
      typeLabel: app.typeBody.label,
      stateText: stateLabel(app.state),
      filedText: row.receivedDate === null ? 'Not yet filed' : formatCivilDate(row.receivedDate),
      meetingText: schedule === undefined ? null : formatCivilDate(schedule.date),
      deadlineText:
        deadline === null
          ? null
          : `${deadline.label}: ${formatCivilDate(deadline.on)}${deadlineOverdue ? ' (overdue)' : ''}`,
    })
  }
  return lines
}

async function commentRequestLines(db: Db, boardId: string): Promise<CommentRequestLine[]> {
  const rows = await db
    .select({
      applicationId: applications.id,
      number: applications.number,
      title: projects.title,
      status: reviewAssignments.status,
      commentBy: reviewAssignments.commentBy,
    })
    .from(reviewAssignments)
    .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(
      and(
        eq(reviewAssignments.boardId, boardId),
        isNull(reviewAssignments.removedAt),
        notInArray(applications.state, [...TERMINAL_STATES]),
      ),
    )
    .orderBy(
      sql`${reviewAssignments.commentBy} asc nulls last`,
      asc(reviewAssignments.assignedAt),
      asc(reviewAssignments.id),
    )
  return rows.map((row) => ({
    applicationId: row.applicationId,
    number: row.number,
    title: row.title,
    statusLabel: boardReviewStatusLabel(row.status),
    commentByText: row.commentBy === null ? null : formatCivilDate(row.commentBy),
  }))
}

export async function loadBoardsView(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<BoardsView | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return null
  const today = await townToday(db, now, signal)
  const boardRows = await activeBoards(db)
  const sections: BoardSection[] = []
  for (const board of boardRows) {
    const meetings = await db
      .select()
      .from(boardMeetings)
      .where(eq(boardMeetings.boardId, board.id))
      .orderBy(asc(boardMeetings.meetingDate))
    sections.push({
      boardId: board.id,
      boardKind: board.kind,
      label: boardLabel(board),
      meetings: meetings.map((m) => ({
        id: m.id,
        dateText: formatCivilDate(m.meetingDate),
        kindText: m.kind === 'special' ? 'Special meeting' : 'Regular meeting',
        location: m.location,
        cancelled: m.status === 'cancelled',
        cancelReason: m.cancelReason,
        past: m.meetingDate < today,
      })),
      applications: await applicationLines(db, board.kind, today, signal),
      commentRequests: await commentRequestLines(db, board.id),
    })
  }
  return { today, sections }
}
