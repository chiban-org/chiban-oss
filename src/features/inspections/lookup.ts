import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, inspections } from '@/db/schema'
import { applicationVisibleTo } from '@/features/access/predicates'
import type { Actor } from '@/features/auth/actor'
import { inspectableTypes } from '@/features/inspections/eligibility'
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
  const types = await inspectableTypes(db, applicationId, signal)
  const type = types.find((t) => t.checklistVersionId === failed.checklistVersionId)
  return type === undefined
    ? null
    : { inspectionId: failed.id, checklistVersionId: type.checklistVersionId, label: type.label }
}
