import { and, eq, isNull, sql } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Tx } from '@/db/client'
import { applications, feeAssessments, feeOverrides } from '@/db/schema'
import { type AnyActor, actorLabel, toAuditActor } from '@/features/audit/actorRef'
import { writeAudit } from '@/features/audit/writeAudit'
import { getVersion } from '@/features/config/store'
import { computeFees } from '@/features/fees/computeFees'
import type { FeeScheduleBody, FeeStage } from '@/features/fees/feeSchema'
import type { FieldValue, ProjectFacts } from '@/features/forms/validateSubmission'
import type { HonestValue } from '@/features/honest/honest'
import { err, ok, type Result } from '@/types/result'

const NO_ABUTTER_LIST: HonestValue<number> = { state: 'unknown' }

export async function assessFees(
  tx: Tx,
  applicationId: string,
  stage: FeeStage,
  actor: AnyActor,
  signal: AbortSignal,
  counts: { abutters: HonestValue<number> } = { abutters: NO_ABUTTER_LIST },
): Promise<Result<{ assessmentId: string; totalCents: number }, 'incomplete'>> {
  signal.throwIfAborted()
  const [app] = await tx.select().from(applications).where(eq(applications.id, applicationId))
  if (app === undefined) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Application not found for fee assessment', {
      applicationId,
    })
  }
  const pins = app.configPins as { feeSchedule: string }
  const schedule = await getVersion(tx, pins.feeSchedule, signal)
  if (schedule === null) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Pinned fee schedule is missing', { applicationId })
  }
  const overrides = await tx
    .select()
    .from(feeOverrides)
    .where(and(eq(feeOverrides.applicationId, applicationId), isNull(feeOverrides.supersededBy)))
  const computation = computeFees(schedule.body as FeeScheduleBody, {
    values: app.values as Record<string, FieldValue>,
    facts: app.facts as ProjectFacts,
    counts,
    stage,
    overrides: overrides.map((o) => ({
      feeCode: o.feeCode,
      kind: o.kind,
      amountCents: o.amountCents,
    })),
  })
  if (!computation.complete || computation.totalCents === null) return err('incomplete')
  const [seq] = await tx
    .select({ next: sql<number>`coalesce(max(${feeAssessments.sequence}), 0) + 1` })
    .from(feeAssessments)
    .where(and(eq(feeAssessments.applicationId, applicationId), eq(feeAssessments.stage, stage)))
  const [row] = await tx
    .insert(feeAssessments)
    .values({
      applicationId,
      stage,
      sequence: seq?.next ?? 1,
      scheduleVersionId: schedule.id,
      computation,
      totalCents: computation.totalCents,
      assessedBy: actorLabel(actor),
    })
    .returning({ id: feeAssessments.id })
  const assessmentId = row?.id ?? ''
  await writeAudit(
    tx,
    {
      actor: toAuditActor(actor),
      action: 'fees.assess',
      entityType: 'application',
      entityId: applicationId,
      after: { assessmentId, stage, totalCents: computation.totalCents },
    },
    signal,
  )
  return ok({ assessmentId, totalCents: computation.totalCents })
}
