import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, inspections, projectParties } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import { itemTarget } from '@/features/applications/documentItemAccess'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { DocKind, RecordRef } from '@/features/documents/types'
import { recordsInspection } from '@/features/inspections/visibility'

const MINUTE_MS = 60 * 1000
const WRITABLE_STATES = ['draft', 'submitted']

async function mayFileItem(
  db: DbOrTx,
  actor: Actor,
  ref: { applicationId: string; itemKey: string },
  signal: AbortSignal,
): Promise<boolean> {
  const role = hasFullRecordAccess(actor) ? 'staff_files' : 'applicant'
  return (await itemTarget(db, actor, { ...ref, role }, signal)).ok
}

async function applicationProject(db: DbOrTx, applicationId: string) {
  const [row] = await db
    .select({ projectId: applications.projectId, state: applications.state })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row ?? null
}

async function isPartyOf(db: DbOrTx, actor: Actor, projectId: string): Promise<boolean> {
  const rows = await db
    .select({ id: projectParties.id })
    .from(projectParties)
    .where(
      and(
        eq(projectParties.projectId, projectId),
        eq(projectParties.userId, actor.userId),
        isNull(projectParties.removedAt),
      ),
    )
    .limit(1)
  return rows.length > 0
}

async function projectHasOpenApplication(db: DbOrTx, projectId: string): Promise<boolean> {
  const rows = await db
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.projectId, projectId))
  return rows.some((r) => WRITABLE_STATES.includes(r.state))
}

const PHOTO_WINDOW_MS = 7 * 24 * 60 * MINUTE_MS

async function mayUploadToInspection(
  db: DbOrTx,
  actor: Actor,
  inspectionId: string,
  signal: AbortSignal,
  now: Date,
): Promise<boolean> {
  if (!(await hasCapability(db, actor.userId, 'inspection.record', signal))) return false
  const [row] = await db.select().from(inspections).where(eq(inspections.id, inspectionId))
  if (row === undefined) return false
  if (!recordsInspection(actor, row.inspectorUserId)) return false
  if (row.status === 'scheduled') return true
  const decided = row.status === 'passed' || row.status === 'failed'
  return (
    decided &&
    row.resultRecordedAt !== null &&
    now.getTime() - row.resultRecordedAt.getTime() <= PHOTO_WINDOW_MS
  )
}

export const CASE_DOC_KINDS: readonly DocKind[] = [
  'enforcement_photo',
  'enforcement_letter',
  'service_proof',
  'court_document',
]

async function mayUploadToCase(db: DbOrTx, actor: Actor, signal: AbortSignal): Promise<boolean> {
  return (
    hasFullRecordAccess(actor) &&
    ((await hasCapability(db, actor.userId, 'enforcement.manage', signal)) ||
      (await hasCapability(db, actor.userId, 'enforcement.record_service', signal)))
  )
}

export async function mayUploadTo(
  db: DbOrTx,
  actor: Actor,
  target: RecordRef & { itemKey?: string | null },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<boolean> {
  if (target.kind === 'application' && typeof target.itemKey === 'string') {
    return await mayFileItem(
      db,
      actor,
      { applicationId: target.id, itemKey: target.itemKey },
      signal,
    )
  }
  if (target.kind === 'inspection') {
    return await mayUploadToInspection(db, actor, target.id, signal, now)
  }
  if (target.kind === 'enforcement_case') return await mayUploadToCase(db, actor, signal)
  if (target.kind === 'rtk_request')
    return await hasCapability(db, actor.userId, 'rtk.manage', signal)
  if (target.kind === 'meeting')
    return await hasCapability(db, actor.userId, 'board.record', signal)
  if (await hasCapability(db, actor.userId, 'document.manage', signal)) return true
  if (target.kind === 'parcel' || hasFullRecordAccess(actor)) return false
  if (target.kind === 'project') {
    return (
      (await isPartyOf(db, actor, target.id)) && (await projectHasOpenApplication(db, target.id))
    )
  }
  const app = await applicationProject(db, target.id)
  if (app === null || !WRITABLE_STATES.includes(app.state)) return false
  return await isPartyOf(db, actor, app.projectId)
}
