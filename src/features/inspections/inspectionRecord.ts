import { and, desc, eq, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { auditLog, type InspectionStatus, inspections } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  type CancelFacts,
  type InspectionPlan,
  planInspection,
} from '@/features/inspections/inspectionPlan'
import {
  type InspectionView,
  loadInspectionView,
  userName,
} from '@/features/inspections/inspectionView'
import { describeIntakeBlock, reinspectableFailureIds } from '@/features/inspections/lookup'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'
import { ok, type Result } from '@/types/result'

const FALLBACK_TIME_ZONE = 'America/New_York'

export interface InspectionRecord {
  view: InspectionView
  plan: InspectionPlan
  maySchedule: boolean
  cancel: CancelFacts | null
  followUpId: string | null
  previousId: string | null
}

async function zoneOf(db: DbOrTx, signal: AbortSignal): Promise<string> {
  const town = await getTownSettings(db, signal)
  return town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE
}

async function cancelFacts(
  db: DbOrTx,
  view: InspectionView,
  zone: string,
): Promise<CancelFacts | null> {
  const { inspection } = view
  if (inspection.status !== 'cancelled') return null
  const [entry] = await db
    .select({ at: auditLog.at, userId: auditLog.actorUserId, kind: auditLog.actorKind })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'inspection'),
        eq(auditLog.entityId, inspection.id),
        eq(auditLog.action, 'inspection.cancel'),
      ),
    )
    .orderBy(desc(auditLog.at))
    .limit(1)
  return {
    reason: inspection.cancelReason,
    byName: entry?.kind === 'user' ? await userName(db, entry.userId) : null,
    on: entry === undefined ? null : todayInTimeZone(zone, entry.at),
  }
}

async function followUpOf(
  db: DbOrTx,
  inspectionId: string,
): Promise<{ id: string; status: InspectionStatus } | null> {
  const [row] = await db
    .select({ id: inspections.id, status: inspections.status })
    .from(inspections)
    .where(and(eq(inspections.reinspectionOf, inspectionId), ne(inspections.status, 'cancelled')))
    .orderBy(desc(inspections.requestedAt))
    .limit(1)
  return row ?? null
}

async function takesReinspection(
  db: DbOrTx,
  view: InspectionView,
  signal: AbortSignal,
): Promise<boolean> {
  const { inspection } = view
  if (inspection.status !== 'failed') return false
  if (!(await reinspectableFailureIds(db, inspection.applicationId)).has(inspection.id)) {
    return false
  }
  const app = await loadApplicationContext(db, inspection.applicationId, signal)
  return (
    app !== null &&
    app.pins.checklists.length > 0 &&
    (await describeIntakeBlock(db, app, signal)) === null
  )
}

export async function loadInspectionRecord(
  db: DbOrTx,
  actor: Actor,
  inspectionId: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<InspectionRecord, 'not_found'>> {
  const loaded = await loadInspectionView(db, actor, inspectionId, signal, now)
  if (!loaded.ok) return loaded
  const view = loaded.value
  const { inspection } = view
  const zone = await zoneOf(db, signal)
  const [maySchedule, recordedByName, cancel, followUp, mayRequestReinspection] = await Promise.all(
    [
      hasCapability(db, actor.userId, 'inspection.schedule', signal),
      userName(db, inspection.resultRecordedBy),
      cancelFacts(db, view, zone),
      inspection.status === 'failed' ? followUpOf(db, inspection.id) : Promise.resolve(null),
      takesReinspection(db, view, signal),
    ],
  )
  const plan = planInspection({
    row: inspection,
    viewerId: actor.userId,
    today: view.today as CivilDate,
    inspectorName: view.inspectorName,
    recordedByName,
    resultDate:
      inspection.resultRecordedAt === null
        ? null
        : todayInTimeZone(zone, inspection.resultRecordedAt),
    preferredDate: inspection.preferredDate as CivilDate | null,
    permitClosed:
      inspection.isFinal && inspection.status === 'passed' && view.applicationState === 'closed',
    mayRecord: view.mayRecord,
    maySchedule,
    suspended: view.suspended,
    cancel,
    followUp,
    mayRequestReinspection,
  })
  return ok({
    view,
    plan,
    maySchedule,
    cancel,
    followUpId: followUp?.id ?? null,
    previousId: inspection.reinspectionOf,
  })
}
