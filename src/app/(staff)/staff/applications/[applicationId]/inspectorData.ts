import { eq } from 'drizzle-orm'
import { users } from '@/db/schema'
import { recordViewFor } from '@/features/applications/recordView'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { hasCapability } from '@/features/authz/capabilities'
import { type InspectionView, loadInspectionView } from '@/features/inspections/inspectionView'
import { lastResult, nextScheduled } from '@/features/inspections/inspectorFocus'
import type { StaffContext } from '@/server/requireStaff'
import type { InspectionsPanelData } from './inspectionsPanel'

export interface InspectorWork {
  next: InspectionView | null
  last: InspectionView | null
  inspectorName: string | null
}

export async function seesInspectorView(
  ctx: StaffContext,
  loaded: { view: StaffApplicationView; inspections: InspectionsPanelData },
): Promise<boolean> {
  const { view, inspections } = loaded
  const facts = {
    managesWorkflow: view.permissions.canManageWorkflow,
    issuesPermits: view.permissions.canIssue,
    state: view.state,
    inspectionCount: inspections.history.length,
  }
  if (recordViewFor({ ...facts, recordsInspections: true }) === 'office') return false
  const recordsInspections = await hasCapability(
    ctx.db,
    ctx.actor.userId,
    'inspection.record',
    ctx.signal,
  )
  return recordViewFor({ ...facts, recordsInspections }) === 'inspector'
}

async function inspectionViewOf(ctx: StaffContext, id: string | undefined) {
  if (id === undefined) return null
  const loaded = await loadInspectionView(ctx.db, ctx.actor, id, ctx.signal)
  return loaded.ok ? loaded.value : null
}

async function nameOf(ctx: StaffContext, userId: string | null): Promise<string | null> {
  if (userId === null) return null
  const [row] = await ctx.db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
  return row?.name ?? null
}

export async function loadInspectorWork(
  ctx: StaffContext,
  inspections: InspectionsPanelData,
): Promise<InspectorWork> {
  const next = nextScheduled(inspections.history)
  const last = lastResult(inspections.history)
  const [nextView, lastView, inspectorName] = await Promise.all([
    inspectionViewOf(ctx, next?.id),
    inspectionViewOf(ctx, last?.id),
    nameOf(ctx, next?.inspectorUserId ?? null),
  ])
  return { next: nextView, last: lastView, inspectorName }
}
