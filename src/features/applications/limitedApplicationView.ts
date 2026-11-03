import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, boardMeetings, hearings, projects, reviewAssignments } from '@/db/schema'
import {
  isBoardMember,
  memberCanSeeApplication,
  memberCanSeeMeeting,
} from '@/features/access/predicates'
import { isReviewer } from '@/features/access/roles'
import { loadApplicationContext } from '@/features/applications/context'
import type { CoreState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { listDocuments } from '@/features/documents/listDocuments'
import type { DocumentListRow } from '@/features/documents/types'
import { hearingText } from '@/features/hearings/views'
import { displayIdsFor } from '@/features/parcels/displayId'

export interface LimitedApplicationView {
  id: string
  number: string
  typeLabel: string
  state: CoreState
  substep: string | null
  substeps: { key: string; label: string }[]
  projectTitle: string
  parcelId: string
  parcelDisplayId: string
  assignments: { assignmentId: string; status: string }[]
  hearings: { id: string; meetingId: string; text: string; hasPacket: boolean }[]
  documents: DocumentListRow[]
}

async function ownAssignments(db: Db, actor: Actor, applicationId: string) {
  if (!isReviewer(actor)) return []
  return await db
    .select({ assignmentId: reviewAssignments.id, status: reviewAssignments.status })
    .from(reviewAssignments)
    .where(
      and(
        eq(reviewAssignments.applicationId, applicationId),
        eq(reviewAssignments.reviewerUserId, actor.userId),
        isNull(reviewAssignments.removedAt),
      ),
    )
}

async function memberHearings(db: Db, actor: Actor, applicationId: string) {
  if (!isBoardMember(actor)) return []
  const [visible] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        memberCanSeeApplication(actor.userId, sql`${applications.id}`),
      ),
    )
  if (visible === undefined) return []
  const rows = await db
    .select({
      hearing: hearings,
      meeting: boardMeetings,
      hasPacket: sql<boolean>`exists (select 1 from board_packets bp where bp.board = ${boardMeetings.board} and bp.meeting_date = ${boardMeetings.meetingDate})`,
    })
    .from(hearings)
    .innerJoin(boardMeetings, eq(boardMeetings.id, hearings.meetingId))
    .where(
      and(
        eq(hearings.applicationId, applicationId),
        inArray(hearings.status, ['scheduled', 'held']),
        memberCanSeeMeeting(actor.userId, sql`${boardMeetings.id}`),
      ),
    )
    .orderBy(asc(boardMeetings.meetingDate))
  return rows.map(({ hearing, meeting, hasPacket }) => ({
    id: hearing.id,
    meetingId: meeting.id,
    hasPacket,
    text: hearingText(hearing.kind, meeting.meetingDate, hearing.status),
  }))
}

export async function getLimitedApplicationView(
  db: Db,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<LimitedApplicationView | null> {
  signal.throwIfAborted()
  const [assignments, heard] = await Promise.all([
    ownAssignments(db, actor, applicationId),
    memberHearings(db, actor, applicationId),
  ])
  if (assignments.length === 0 && heard.length === 0) return null
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return null
  const [project] = await db
    .select({ title: projects.title, parcelId: projects.parcelId })
    .from(projects)
    .where(eq(projects.id, app.projectId))
  if (project === undefined) return null
  const [display, documents] = await Promise.all([
    displayIdsFor(db, [project.parcelId]),
    listDocuments(
      db,
      actor,
      { record: { kind: 'application', id: applicationId }, limit: 100 },
      signal,
    ),
  ])
  return {
    id: app.id,
    number: app.number,
    typeLabel: app.typeBody.label,
    state: app.state,
    substep: app.substep,
    substeps: app.typeBody.workflow.substeps
      .filter((s) => s.state === app.state)
      .map((s) => ({ key: s.key, label: s.label })),
    projectTitle: project.title,
    parcelId: project.parcelId,
    parcelDisplayId: display.get(project.parcelId) ?? 'No map-lot ID',
    assignments,
    hearings: heard,
    documents: documents.rows,
  }
}
