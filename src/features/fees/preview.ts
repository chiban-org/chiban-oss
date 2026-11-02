import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { feeAssessments, feeOverrides } from '@/db/schema'
import type { ApplicationContext } from '@/features/applications/context'
import { getVersion } from '@/features/config/store'
import { computeFees, type FeeComputation } from '@/features/fees/computeFees'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'

export async function previewFees(
  db: DbOrTx,
  app: ApplicationContext,
  signal: AbortSignal,
): Promise<FeeComputation | null> {
  signal.throwIfAborted()
  const stage = app.typeBody.payTiming
  const assessed = await db
    .select({ id: feeAssessments.id })
    .from(feeAssessments)
    .where(and(eq(feeAssessments.applicationId, app.id), eq(feeAssessments.stage, stage)))
    .limit(1)
  if (assessed.length > 0) return null
  const schedule = await getVersion(db, app.pins.feeSchedule, signal)
  if (schedule === null) return null
  const overrides = await db
    .select()
    .from(feeOverrides)
    .where(and(eq(feeOverrides.applicationId, app.id), isNull(feeOverrides.supersededBy)))
  return computeFees(schedule.body as FeeScheduleBody, {
    values: app.values,
    facts: app.facts,
    counts: { abutters: { state: 'unknown' } },
    stage,
    overrides: overrides.map((o) => ({
      feeCode: o.feeCode,
      kind: o.kind,
      amountCents: o.amountCents,
    })),
  })
}
