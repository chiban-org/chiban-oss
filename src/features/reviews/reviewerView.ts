import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applications,
  projects,
  reviewAssignments,
  reviewComments,
  trcRoutings,
  userRoles,
  users,
} from '@/db/schema'
import { isReviewer } from '@/features/access/roles'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { listDocuments } from '@/features/documents/listDocuments'
import type { DocumentListRow } from '@/features/documents/types'
import { displayIdsFor } from '@/features/parcels/displayId'

export interface MyAssignment {
  assignmentId: string
  applicationId: string
  number: string
  status: string
}

export async function listMyAssignments(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<MyAssignment[]> {
  signal.throwIfAborted()
  if (!isReviewer(actor)) return []
  return await db
    .select({
      assignmentId: reviewAssignments.id,
      applicationId: reviewAssignments.applicationId,
      number: applications.number,
      status: reviewAssignments.status,
    })
    .from(reviewAssignments)
    .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
    .where(
      and(eq(reviewAssignments.reviewerUserId, actor.userId), isNull(reviewAssignments.removedAt)),
    )
    .orderBy(desc(reviewAssignments.assignedAt))
}

export interface AssignmentView {
  assignmentId: string
  applicationId: string
  number: string
  status: string
  projectTitle: string
  typeLabel: string
  parcelId: string
  parcelDisplayId: string | null
  commentDue: string | null
  comments: { body: string; createdAt: Date }[]
  documents: DocumentListRow[]
}

export async function getAssignmentView(
  db: DbOrTx,
  actor: Actor,
  assignmentId: string,
  signal: AbortSignal,
): Promise<AssignmentView | null> {
  signal.throwIfAborted()
  if (!isReviewer(actor)) return null
  const [row] = await db
    .select({
      assignmentId: reviewAssignments.id,
      applicationId: reviewAssignments.applicationId,
      number: applications.number,
      status: reviewAssignments.status,
      projectTitle: projects.title,
      parcelId: projects.parcelId,
      commentDue: trcRoutings.commentDue,
    })
    .from(reviewAssignments)
    .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .leftJoin(trcRoutings, eq(trcRoutings.assignmentId, reviewAssignments.id))
    .where(
      and(
        eq(reviewAssignments.id, assignmentId),
        eq(reviewAssignments.reviewerUserId, actor.userId),
        isNull(reviewAssignments.removedAt),
      ),
    )
  if (row === undefined) return null
  const comments = await db
    .select({ body: reviewComments.body, createdAt: reviewComments.createdAt })
    .from(reviewComments)
    .where(eq(reviewComments.assignmentId, assignmentId))
    .orderBy(asc(reviewComments.createdAt))
  const documents = await listDocuments(
    db,
    actor,
    { record: { kind: 'application', id: row.applicationId }, limit: 100 },
    signal,
  )
  const context = await loadApplicationContext(db, row.applicationId, signal)
  const display = await displayIdsFor(db, [row.parcelId])
  return {
    ...row,
    typeLabel: context?.typeBody.label ?? '',
    parcelDisplayId: display.get(row.parcelId) ?? null,
    comments,
    documents: documents.rows,
  }
}

export interface ApplicationReviewer {
  assignmentId: string
  reviewerUserId: string
  name: string
  status: string
}

export async function listApplicationReviewers(
  db: DbOrTx,
  applicationId: string,
): Promise<ApplicationReviewer[]> {
  return await db
    .select({
      assignmentId: reviewAssignments.id,
      reviewerUserId: reviewAssignments.reviewerUserId,
      name: users.displayName,
      status: reviewAssignments.status,
    })
    .from(reviewAssignments)
    .innerJoin(users, eq(users.id, reviewAssignments.reviewerUserId))
    .where(
      and(eq(reviewAssignments.applicationId, applicationId), isNull(reviewAssignments.removedAt)),
    )
    .orderBy(asc(reviewAssignments.assignedAt))
}

export async function listReviewerChoices(db: DbOrTx): Promise<{ id: string; name: string }[]> {
  return await db
    .selectDistinct({ id: users.id, name: users.displayName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(userRoles.role, 'reviewer'), eq(users.isActive, true)))
    .orderBy(asc(users.displayName))
}
