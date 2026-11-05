import type { Board } from '@packs/nh/schema'
import { and, asc, eq, inArray, ne, or } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { acceptanceSchedules, applications, boardMeetings, projects } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { stateLabel } from '@/features/applications/stateLabel'
import type { CoreState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import { headlineDeadline } from '@/features/queue/headlineDeadline'
import { DEADLINE_OPEN, NEXT_DUE, NEXT_DUE_RULE_KEY, NOTICE_DUE } from '@/features/queue/queueSql'
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

export interface BoardSection {
  board: Board
  label: string
  meetings: MeetingLine[]
  applications: BoardApplicationLine[]
}

export interface BoardsView {
  today: string
  sections: BoardSection[]
}

const OPEN_STATES: CoreState[] = ['submitted', 'under_review', 'decided']

async function applicationLines(
  db: Db,
  board: Board,
  today: string,
  signal: AbortSignal,
): Promise<BoardApplicationLine[]> {
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
    if (app === null || boardOfApplication(app) !== board) continue
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

export async function loadBoardsView(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<BoardsView | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return null
  const today = await townToday(db, now, signal)
  const settings = await getBoardSettings(db, signal)
  const sections: BoardSection[] = []
  for (const board of ['planning_board', 'zba'] as const) {
    const meetings = await db
      .select()
      .from(boardMeetings)
      .where(eq(boardMeetings.board, board))
      .orderBy(asc(boardMeetings.meetingDate))
    sections.push({
      board,
      label: boardLabel(settings, board),
      meetings: meetings.map((m) => ({
        id: m.id,
        dateText: formatCivilDate(m.meetingDate),
        kindText: m.kind === 'special' ? 'Special meeting' : 'Regular meeting',
        location: m.location,
        cancelled: m.status === 'cancelled',
        cancelReason: m.cancelReason,
        past: m.meetingDate < today,
      })),
      applications: await applicationLines(db, board, today, signal),
    })
  }
  return { today, sections }
}
