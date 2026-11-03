import { asc, eq } from 'drizzle-orm'
import { applicationSnapshots } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { loadPanelDocuments } from '@/features/documents/panelData'
import { applicationHolds } from '@/features/records/holds'
import { listApplicationReviewers, listReviewerChoices } from '@/features/reviews/reviewerView'
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
    canAssign,
    town,
    reviewers,
    choices,
    documents,
    canPublish,
    canManageDocuments,
    canHold,
    snapshots,
    appHolds,
  ] = await Promise.all([
    can('review.assign'),
    getTownSettings(ctx.db, ctx.signal),
    listApplicationReviewers(ctx.db, applicationId),
    listReviewerChoices(ctx.db),
    loadPanelDocuments(ctx.db, ctx.actor, { kind: 'application', id: applicationId }, ctx.signal),
    can('document.publish'),
    can('document.manage'),
    can('hold.place_release'),
    snapshotsOf(ctx, applicationId),
    applicationHolds(ctx.db, applicationId, projectId),
  ])
  return {
    reviewers,
    canAssign,
    choices: canAssign ? choices : [],
    documents,
    canPublish,
    canManageDocuments,
    canHold,
    snapshots,
    appHolds,
    zone: town.ok ? town.value.timeZone : FALLBACK_ZONE,
  }
}
