import { and, asc, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applications,
  boards,
  projects,
  reviewAssignments,
  reviewComments,
  users,
} from '@/db/schema'
import { activeMembershipOn, isBoardMember } from '@/features/access/predicates'
import { loadApplicationContext } from '@/features/applications/context'
import { isTerminalState, TERMINAL_STATES } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { listDocuments } from '@/features/documents/listDocuments'
import type { DocumentListRow } from '@/features/documents/types'
import { displayIdsFor } from '@/features/parcels/displayId'
import { boardReviewStatusLabel } from '@/features/reviews/statusLabels'

export interface BoardComment {
  id: string
  body: string
  createdAt: Date
  attribution: string
}

export interface ApplicationBoardAssignment {
  assignmentId: string
  boardId: string
  boardName: string
  boardShortName: string
  status: string
  statusLabel: string
  commentBy: string | null
  withdrawn: boolean
  comments: BoardComment[]
}

export interface MemberBoardAssignmentRow {
  assignmentId: string
  number: string
  projectTitle: string
  boardShortName: string
  commentBy: string | null
  status: string
  statusLabel: string
}

export interface BoardAssignmentView extends MemberBoardAssignmentRow {
  applicationId: string
  boardName: string
  typeLabel: string
  parcelDisplayId: string | null
  open: boolean
  comments: BoardComment[]
  documents: DocumentListRow[]
}

function seatedOnAssignedBoard(actor: Actor) {
  return and(
    isNotNull(reviewAssignments.boardId),
    isNull(reviewAssignments.removedAt),
    activeMembershipOn(actor.userId, sql`${reviewAssignments.boardId}`),
  )
}

async function commentsFor(
  db: DbOrTx,
  assignmentIds: string[],
): Promise<Map<string, BoardComment[]>> {
  if (assignmentIds.length === 0) return new Map()
  const rows = await db
    .select({
      id: reviewComments.id,
      assignmentId: reviewComments.assignmentId,
      body: reviewComments.body,
      createdAt: reviewComments.createdAt,
      author: users.displayName,
      boardShortName: boards.shortName,
    })
    .from(reviewComments)
    .innerJoin(reviewAssignments, eq(reviewAssignments.id, reviewComments.assignmentId))
    .innerJoin(boards, eq(boards.id, reviewAssignments.boardId))
    .leftJoin(users, eq(users.id, reviewComments.authorUserId))
    .where(inArray(reviewComments.assignmentId, assignmentIds))
    .orderBy(asc(reviewComments.createdAt), asc(reviewComments.id))
  const byAssignment = new Map<string, BoardComment[]>()
  for (const row of rows) {
    const comment = {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      attribution:
        row.author === null ? row.boardShortName : `${row.author}, ${row.boardShortName}`,
    }
    byAssignment.set(row.assignmentId, [...(byAssignment.get(row.assignmentId) ?? []), comment])
  }
  return byAssignment
}

export async function listApplicationBoardAssignments(
  db: DbOrTx,
  applicationId: string,
): Promise<ApplicationBoardAssignment[]> {
  const rows = await db
    .select({
      assignmentId: reviewAssignments.id,
      boardId: boards.id,
      boardName: boards.name,
      boardShortName: boards.shortName,
      status: reviewAssignments.status,
      commentBy: reviewAssignments.commentBy,
      withdrawn: sql<boolean>`${reviewAssignments.removedAt} is not null`,
    })
    .from(reviewAssignments)
    .innerJoin(boards, eq(boards.id, reviewAssignments.boardId))
    .where(
      and(
        eq(reviewAssignments.applicationId, applicationId),
        sql`(${reviewAssignments.removedAt} is null or exists (
          select 1 from review_comments rc where rc.assignment_id = ${reviewAssignments.id}))`,
      ),
    )
    .orderBy(asc(reviewAssignments.assignedAt))
  const comments = await commentsFor(
    db,
    rows.map((r) => r.assignmentId),
  )
  return rows.map((row) => ({
    ...row,
    statusLabel: row.withdrawn ? 'Withdrawn' : boardReviewStatusLabel(row.status),
    comments: comments.get(row.assignmentId) ?? [],
  }))
}

const MEMBER_ROW = {
  assignmentId: reviewAssignments.id,
  number: applications.number,
  projectTitle: projects.title,
  boardShortName: boards.shortName,
  commentBy: reviewAssignments.commentBy,
  status: reviewAssignments.status,
}

export async function listMemberBoardAssignments(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<MemberBoardAssignmentRow[]> {
  signal.throwIfAborted()
  if (!isBoardMember(actor)) return []
  const rows = await db
    .select(MEMBER_ROW)
    .from(reviewAssignments)
    .innerJoin(boards, eq(boards.id, reviewAssignments.boardId))
    .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(and(seatedOnAssignedBoard(actor), notInArray(applications.state, [...TERMINAL_STATES])))
    .orderBy(
      sql`${reviewAssignments.commentBy} asc nulls last`,
      asc(reviewAssignments.assignedAt),
      asc(reviewAssignments.id),
    )
  return rows.map((row) => ({ ...row, statusLabel: boardReviewStatusLabel(row.status) }))
}

export async function getBoardAssignmentView(
  db: DbOrTx,
  actor: Actor,
  assignmentId: string,
  signal: AbortSignal,
): Promise<BoardAssignmentView | null> {
  signal.throwIfAborted()
  if (!isBoardMember(actor)) return null
  const [row] = await db
    .select({
      ...MEMBER_ROW,
      applicationId: applications.id,
      boardName: boards.name,
      parcelId: projects.parcelId,
      state: applications.state,
    })
    .from(reviewAssignments)
    .innerJoin(boards, eq(boards.id, reviewAssignments.boardId))
    .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(and(eq(reviewAssignments.id, assignmentId), seatedOnAssignedBoard(actor)))
  if (row === undefined) return null
  const [context, display, documents, comments] = await Promise.all([
    loadApplicationContext(db, row.applicationId, signal),
    displayIdsFor(db, [row.parcelId]),
    listDocuments(
      db,
      actor,
      { record: { kind: 'application', id: row.applicationId }, limit: 100, audience: 'reviewers' },
      signal,
    ),
    commentsFor(db, [assignmentId]),
  ])
  const { parcelId, state, ...fields } = row
  return {
    ...fields,
    statusLabel: boardReviewStatusLabel(row.status),
    typeLabel: context?.typeBody.label ?? '',
    parcelDisplayId: display.get(parcelId) ?? null,
    open: !isTerminalState(state),
    comments: comments.get(assignmentId) ?? [],
    documents: documents.rows,
  }
}
