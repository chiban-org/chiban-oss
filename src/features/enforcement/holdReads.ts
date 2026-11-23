import { and, eq, gte, inArray, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applicationParcels,
  applications,
  developmentHolds,
  enforcementCases,
  holdPermitActions,
  projects,
} from '@/db/schema'
import { cureRules } from '@/features/enforcement/cureRules'

export { HELD_PARCEL_COPY } from '@/features/enforcement/holdCopy'

export interface ActiveHold {
  holdId: string
  caseId: string
}

export function holdsEnabled(): boolean {
  return cureRules().some((r) => r.remedies.developmentHold)
}

export async function activeHoldsOn(
  db: DbOrTx,
  parcelIds: readonly string[],
  signal: AbortSignal,
): Promise<(ActiveHold & { parcelId: string })[]> {
  signal.throwIfAborted()
  if (!holdsEnabled() || parcelIds.length === 0) return []
  return await db
    .select({
      holdId: developmentHolds.id,
      caseId: developmentHolds.caseId,
      parcelId: developmentHolds.parcelId,
    })
    .from(developmentHolds)
    .where(
      and(inArray(developmentHolds.parcelId, [...parcelIds]), isNull(developmentHolds.releasedOn)),
    )
}

export async function activeHoldFor(
  db: DbOrTx,
  parcelId: string,
  signal: AbortSignal,
): Promise<ActiveHold | null> {
  const [hold] = await activeHoldsOn(db, [parcelId], signal)
  return hold === undefined ? null : { holdId: hold.holdId, caseId: hold.caseId }
}

export async function parcelHoldNotice(
  db: DbOrTx,
  parcelId: string,
  signal: AbortSignal,
): Promise<{ caseId: string; caseNumber: string; placedOn: string } | null> {
  const hold = await activeHoldFor(db, parcelId, signal)
  if (hold === null) return null
  const [row] = await db
    .select({ number: enforcementCases.number, placedOn: developmentHolds.placedOn })
    .from(developmentHolds)
    .innerJoin(enforcementCases, eq(enforcementCases.id, developmentHolds.caseId))
    .where(eq(developmentHolds.id, hold.holdId))
  return row === undefined
    ? null
    : { caseId: hold.caseId, caseNumber: row.number, placedOn: row.placedOn }
}

export async function applicationParcelIds(db: DbOrTx, applicationId: string): Promise<string[]> {
  const [project, extra] = await Promise.all([
    db
      .select({ parcelId: projects.parcelId })
      .from(applications)
      .innerJoin(projects, eq(projects.id, applications.projectId))
      .where(eq(applications.id, applicationId)),
    db
      .select({ parcelId: applicationParcels.parcelId })
      .from(applicationParcels)
      .where(eq(applicationParcels.applicationId, applicationId)),
  ])
  return [...new Set([...project, ...extra].map((r) => r.parcelId))]
}

export async function holdBlocksApplication(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  if (!holdsEnabled()) return false
  const parcelIds = await applicationParcelIds(db, applicationId)
  return (await activeHoldsOn(db, parcelIds, signal)).length > 0
}

export async function holdSuspends(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  if (!holdsEnabled()) return false
  const rows = await db
    .select({ holdId: holdPermitActions.holdId })
    .from(holdPermitActions)
    .innerJoin(developmentHolds, eq(developmentHolds.id, holdPermitActions.holdId))
    .where(
      and(
        eq(holdPermitActions.applicationId, applicationId),
        eq(holdPermitActions.action, 'suspended'),
        isNull(holdPermitActions.reinstatedOn),
        isNull(developmentHolds.releasedOn),
      ),
    )
    .limit(1)
  return rows.length > 0
}

export async function holdActedOnOrAfter(
  db: DbOrTx,
  applicationId: string,
  on: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  if (!holdsEnabled()) return false
  const rows = await db
    .select({ actedOn: holdPermitActions.actedOn })
    .from(holdPermitActions)
    .where(
      and(
        eq(holdPermitActions.applicationId, applicationId),
        eq(holdPermitActions.action, 'suspended'),
        isNull(holdPermitActions.reinstatedOn),
        gte(holdPermitActions.actedOn, on),
      ),
    )
    .limit(1)
  return rows.length > 0
}
