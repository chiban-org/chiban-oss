import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { feeOverrides } from '@/db/schema'
import { issuedRecipientCount } from '@/features/abutters/queries'
import type { ApplicationContext } from '@/features/applications/context'
import { getVersion } from '@/features/config/store'
import { computeFees, type FeeComputation, type FeeLineResult } from '@/features/fees/computeFees'
import { FEE_STAGES, type FeeScheduleBody } from '@/features/fees/feeSchema'
import type { FieldValue } from '@/features/forms/validateSubmission'

function amountOf(line: FeeLineResult): string {
  return 'value' in line.amount ? String(line.amount.value) : 'pending'
}

export function sameFees(before: FeeComputation, after: FeeComputation): boolean {
  if (before.lines.length !== after.lines.length) return false
  return before.lines.every((line, index) => {
    const other = after.lines.at(index)
    return other !== undefined && other.code === line.code && amountOf(other) === amountOf(line)
  })
}

export async function feesWouldChange(
  db: DbOrTx,
  app: ApplicationContext,
  values: Record<string, FieldValue>,
  signal: AbortSignal,
): Promise<boolean> {
  const schedule = await getVersion(db, app.pins.feeSchedule, signal)
  if (schedule === null) return false
  const body = schedule.body as FeeScheduleBody
  const overrides = await db
    .select({
      feeCode: feeOverrides.feeCode,
      kind: feeOverrides.kind,
      amountCents: feeOverrides.amountCents,
    })
    .from(feeOverrides)
    .where(and(eq(feeOverrides.applicationId, app.id), isNull(feeOverrides.supersededBy)))
  const abutters = await issuedRecipientCount(db, app.id, signal)
  return FEE_STAGES.some((stage) => {
    const shared = { facts: app.facts, counts: { abutters }, stage, overrides }
    const before = computeFees(body, { ...shared, values: app.values })
    const after = computeFees(body, { ...shared, values })
    return !sameFees(before, after)
  })
}
