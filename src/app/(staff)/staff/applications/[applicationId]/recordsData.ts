import { asc, eq } from 'drizzle-orm'
import { applicationSnapshots } from '@/db/schema'
import { loadDocumentChecklist } from '@/features/applications/documentChecklistView'
import { mayActAsPlumbingOwnerOf } from '@/features/applications/plumbingOwner'
import { hasCapability } from '@/features/authz/capabilities'
import { mayMarkComplete } from '@/features/building/completeness'
import { loadPanelDocuments } from '@/features/documents/panelData'
import { applicationHolds } from '@/features/records/holds'
import { assignableBoards } from '@/features/reviews/boardAssignments'
import { listApplicationBoardAssignments } from '@/features/reviews/boardAssignmentView'
import {
  listApplicationReviewers,
  listReviewerChoices,
  withReviewComments,
} from '@/features/reviews/reviewerView'
import { getTownSettings } from '@/features/town/settings'
import type { StaffContext } from '@/server/requireStaff'

const FALLBACK_ZONE = 'America/New_York'

function snapshotsOf(ctx: StaffContext, applicationId: string) {
  return ctx.db
    .select({
      id: applicationSnapshots.id,
      sequence: applicationSnapshots.sequence,
      reason: applicationSnapshots.reason,
      createdAt: applicationSnapshots.createdAt,
    })
    .from(applicationSnapshots)
    .where(eq(applicationSnapshots.applicationId, applicationId))
    .orderBy(asc(applicationSnapshots.sequence))
}

export async function loadRecordsData(ctx: StaffContext, applicationId: string, projectId: string) {
  const can = (capability: Parameters<typeof hasCapability>[2]) =>
    hasCapability(ctx.db, ctx.actor.userId, capability, ctx.signal)
  const [
    canAssignBoards,
    town,
    reviewers,
    choices,
    documents,
    canPublish,
    canManageDocuments,
    canHold,
    snapshots,
    appHolds,
    boardAssignments,
    boards,
    checklist,
    canAcceptItems,
    canMarkComplete,
  ] = await Promise.all([
    can('review.assign'),
    getTownSettings(ctx.db, ctx.signal),
    listApplicationReviewers(ctx.db, applicationId).then((rows) =>
      withReviewComments(ctx.db, ctx.actor, rows, ctx.signal),
    ),
    listReviewerChoices(ctx.db),
    loadPanelDocuments(ctx.db, ctx.actor, { kind: 'application', id: applicationId }, ctx.signal),
    can('document.publish'),
    can('document.manage'),
    can('hold.place_release'),
    snapshotsOf(ctx, applicationId),
    applicationHolds(ctx.db, applicationId, projectId),
    listApplicationBoardAssignments(ctx.db, applicationId),
    assignableBoards(ctx.db, applicationId, ctx.signal),
    loadDocumentChecklist(ctx.db, ctx.actor, applicationId, ctx.signal),
    can('application.manage'),
    mayMarkComplete(ctx.db, ctx.actor, applicationId, ctx.signal),
  ])
  const canAssign =
    canAssignBoards || (await mayActAsPlumbingOwnerOf(ctx.db, ctx.actor, applicationId, ctx.signal))
  return {
    reviewers,
    canAssign,
    choices: canAssign ? choices : [],
    boardAssignments,
    boardChoices: canAssignBoards ? boards.map((b) => ({ id: b.id, name: b.name })) : [],
    documents,
    canPublish,
    canManageDocuments,
    canHold,
    snapshots,
    appHolds,
    checklist,
    canAcceptItems,
    canMarkComplete,
    zone: town.ok ? town.value.timeZone : FALLBACK_ZONE,
  }
}
