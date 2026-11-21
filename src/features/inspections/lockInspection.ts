import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { inspections } from '@/db/schema'
import { lockApplication } from '@/features/applications/lockApplication'
import type { CoreState } from '@/features/applications/states'

export interface LockedInspection {
  inspection: typeof inspections.$inferSelect
  appState: CoreState | null
}

export async function lockInspectionAfterApplication(
  tx: Tx,
  inspectionId: string,
): Promise<LockedInspection | null> {
  const [owner] = await tx
    .select({ applicationId: inspections.applicationId })
    .from(inspections)
    .where(eq(inspections.id, inspectionId))
  if (owner === undefined) return null
  const appState = await lockApplication(tx, owner.applicationId)
  const [inspection] = await tx
    .select()
    .from(inspections)
    .where(eq(inspections.id, inspectionId))
    .for('update')
  return inspection === undefined ? null : { inspection, appState }
}
