import { desc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { clockAdjustments, clocks } from '@/db/schema'
import type { OverrideStatus } from '@/features/parcels/aliasOverrides'

export type ClockAdjustmentRow = typeof clockAdjustments.$inferSelect & {
  ruleKey: string
  applicationId: string
  status: OverrideStatus
}

function statusOf(adjustmentSuperseded: boolean, clockStatus: string): OverrideStatus {
  if (adjustmentSuperseded) return 'superseded'
  if (clockStatus === 'superseded') return 'no_match'
  if (clockStatus !== 'running') return 'expired'
  return 'applied'
}

export async function listClockAdjustments(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<ClockAdjustmentRow[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({
      a: clockAdjustments,
      ruleKey: clocks.ruleKey,
      applicationId: clocks.applicationId,
      clockStatus: clocks.status,
    })
    .from(clockAdjustments)
    .innerJoin(clocks, eq(clocks.id, clockAdjustments.clockId))
    .orderBy(desc(clockAdjustments.createdAt))
  return rows.map(({ a, ruleKey, applicationId, clockStatus }) => ({
    ...a,
    ruleKey,
    applicationId,
    status: statusOf(a.supersededBy !== null, clockStatus),
  }))
}
