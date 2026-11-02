import { asc, eq } from 'drizzle-orm'
import { applicationSnapshots } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { loadPanelDocuments } from '@/features/documents/panelData'
import { applicationHolds } from '@/features/records/holds'
import { listApplicationReviewers, listReviewerChoices } from '@/features/reviews/reviewerView'
import { getTownSettings } from '@/features/town/settings'
import type { StaffContext } from '@/server/requireStaff'

const FALLBACK_ZONE = 'America/New_York'

export async function loadRecordsData(ctx: StaffContext, applicationId: string, projectId: string) {
  const can = (capability: Parameters<typeof hasCapability>[2]) =>
    hasCapability(ctx.db, ctx.actor.userId, capability, ctx.signal)
  const canAssign = await can('review.assign')
  const town = await getTownSettings(ctx.db, ctx.signal)
  return {
    reviewers: await listApplicationReviewers(ctx.db, applicationId),
    canAssign,
    choices: canAssign ? await listReviewerChoices(ctx.db) : [],
    documents: await loadPanelDocuments(
      ctx.db,
      ctx.actor,
      { kind: 'application', id: applicationId },
      ctx.signal,
    ),
    canPublish: await can('document.publish'),
    canManageDocuments: await can('document.manage'),
    canHold: await can('hold.place_release'),
    snapshots: await ctx.db
      .select({
        id: applicationSnapshots.id,
        sequence: applicationSnapshots.sequence,
        reason: applicationSnapshots.reason,
        createdAt: applicationSnapshots.createdAt,
      })
      .from(applicationSnapshots)
      .where(eq(applicationSnapshots.applicationId, applicationId))
      .orderBy(asc(applicationSnapshots.sequence)),
    appHolds: await applicationHolds(ctx.db, applicationId, projectId),
    zone: town.ok ? town.value.timeZone : FALLBACK_ZONE,
  }
}
