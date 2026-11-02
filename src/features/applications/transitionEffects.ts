import type { Tx } from '@/db/client'
import type { ApplicationContext } from '@/features/applications/context'
import { type CoreState, TERMINAL_STATES } from '@/features/applications/states'
import type { AnyActor } from '@/features/audit/actorRef'
import { markClockMet, startClocksFor, stopRunningClocks } from '@/features/clocks/startClocks'
import { assessFees } from '@/features/fees/assess'
import {
  cancelOpenInspections,
  type PermitStateReason,
} from '@/features/inspections/permitStateEffect'
import { feeBalance } from '@/features/ledger/feeBalance'
import { queueForParties } from '@/features/notifications/queue'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const INSPECTION_CANCEL_REASON: Partial<Record<CoreState, PermitStateReason>> = {
  suspended: 'permit_suspended',
  expired: 'permit_expired',
  closed: 'permit_closed',
  withdrawn: 'permit_closed',
}

const DECISION_CLOCK_KEYS = ['nh.bp.decision', 'nh.pb.decision', 'nh.zba.decision']

export async function assessForTransition(
  tx: Tx,
  actor: AnyActor,
  app: ApplicationContext,
  to: CoreState,
  signal: AbortSignal,
): Promise<Result<void, 'fees_incomplete'>> {
  const payAtIntake = app.typeBody.payTiming === 'at_intake'
  const stage =
    to === 'submitted' && payAtIntake
      ? 'at_intake'
      : to === 'decided' || (to === 'issued' && app.state === 'submitted' && !payAtIntake)
        ? 'at_approval'
        : null
  if (stage === null) return ok(undefined)
  const assessed = await assessFees(tx, app.id, stage, actor, signal)
  if (!assessed.ok) return err('fees_incomplete')
  if (stage === 'at_approval') await notifyFeesDue(tx, app.id, signal)
  return ok(undefined)
}

async function notifyFeesDue(tx: Tx, applicationId: string, signal: AbortSignal): Promise<void> {
  const balance = await feeBalance(tx, applicationId, signal)
  if (balance.dueCents <= 0) return
  await queueForParties(
    tx,
    {
      event: 'fees_due',
      applicationId,
      discriminator: String(balance.dueCents),
      extra: { amountCents: balance.dueCents },
    },
    signal,
  )
}

export async function runTransitionEffects(
  tx: Tx,
  app: ApplicationContext,
  to: CoreState,
  today: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  if (to === 'submitted') await startClocksFor(tx, app.id, 'application_received', today, signal)
  const issuedDirectly = to === 'issued' && app.state === 'submitted'
  if (to === 'decided' || to === 'denied' || issuedDirectly) {
    for (const key of DECISION_CLOCK_KEYS) await markClockMet(tx, app.id, key, today, signal)
  }
  if (to === 'issued' && app.state !== 'suspended') {
    await startClocksFor(tx, app.id, 'permit_issued', today, signal)
  }
  if (TERMINAL_STATES.includes(to)) await stopRunningClocks(tx, app.id, signal)
  const inspectionReason = INSPECTION_CANCEL_REASON[to]
  if (inspectionReason !== undefined) {
    await cancelOpenInspections(tx, app.id, inspectionReason, signal)
  }
}
