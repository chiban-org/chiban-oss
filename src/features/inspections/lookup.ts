import { and, desc, eq, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, inspections } from '@/db/schema'
import { applicationVisibleTo } from '@/features/access/predicates'
import { isSuspended } from '@/features/appeals/suspension'
import type { Actor } from '@/features/auth/actor'
import { inspectableTypes } from '@/features/inspections/eligibility'
import { INSPECTION_ERROR_COPY } from '@/features/inspections/errorCopy'
import { inspectionVisibleTo } from '@/features/inspections/visibility'
import { isUuid } from '@/utils/uuid'

export async function findIssuedApplicationByNumber(
  db: DbOrTx,
  actor: Actor,
  number: string,
  signal: AbortSignal,
): Promise<{ id: string; number: string; state: string } | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ id: applications.id, number: applications.number, state: applications.state })
    .from(applications)
    .where(and(eq(applications.number, number.trim()), applicationVisibleTo(actor)))
  return row ?? null
}

export async function describeIntakeBlock(
  db: DbOrTx,
  target: { id: string; number: string; state: string },
  signal: AbortSignal,
): Promise<string | null> {
  if (target.state === 'suspended' || (await isSuspended(db, target.id, signal))) {
    return INSPECTION_ERROR_COPY.permit_suspended ?? null
  }
  if (target.state !== 'issued') {
    return `${target.number} is not issued, so it cannot be inspected yet.`
  }
  return null
}

export async function reinspectableFailureIds(
  db: DbOrTx,
  applicationId: string,
): Promise<Set<string>> {
  const failed = await db
    .select()
    .from(inspections)
    .where(and(eq(inspections.applicationId, applicationId), eq(inspections.status, 'failed')))
    .orderBy(desc(inspections.requestedAt), desc(inspections.id))
  const followUps = await db
    .select({ of: inspections.reinspectionOf })
    .from(inspections)
    .where(and(eq(inspections.applicationId, applicationId), ne(inspections.status, 'cancelled')))
  const answered = new Set(followUps.map((f) => f.of))
  const latestPerType = new Map<string, string>()
  for (const row of failed) {
    if (answered.has(row.id) || latestPerType.has(row.inspectionType)) continue
    latestPerType.set(row.inspectionType, row.id)
  }
  return new Set(latestPerType.values())
}

export async function findReinspectionTarget(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  inspectionId: string,
  signal: AbortSignal,
): Promise<{ inspectionId: string; checklistVersionId: string; label: string } | null> {
  signal.throwIfAborted()
  if (!isUuid(inspectionId)) return null
  const [failed] = await db
    .select()
    .from(inspections)
    .where(
      and(
        eq(inspections.id, inspectionId),
        eq(inspections.applicationId, applicationId),
        eq(inspections.status, 'failed'),
        inspectionVisibleTo(actor),
      ),
    )
  if (failed === undefined) return null
  if (!(await reinspectableFailureIds(db, applicationId)).has(failed.id)) return null
  const types = await inspectableTypes(db, applicationId, signal)
  const type = types.find((t) => t.checklistVersionId === failed.checklistVersionId)
  return type === undefined
    ? null
    : { inspectionId: failed.id, checklistVersionId: type.checklistVersionId, label: type.label }
}
