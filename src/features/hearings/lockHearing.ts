import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { hearings } from '@/db/schema'
import { lockApplication } from '@/features/applications/lockApplication'

export async function lockHearingAfterApplication(
  tx: Tx,
  hearingId: string,
): Promise<typeof hearings.$inferSelect | null> {
  const [owner] = await tx
    .select({ applicationId: hearings.applicationId })
    .from(hearings)
    .where(eq(hearings.id, hearingId))
  if (owner === undefined) return null
  await lockApplication(tx, owner.applicationId)
  const [hearing] = await tx.select().from(hearings).where(eq(hearings.id, hearingId)).for('update')
  return hearing ?? null
}
