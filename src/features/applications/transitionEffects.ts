import type { Tx } from '@/db/client'
import type { ApplicationContext } from '@/features/applications/context'
import { type CoreState, TERMINAL_STATES } from '@/features/applications/states'
import type { AnyActor } from '@/features/audit/actorRef'
import { markClockMet, startClocksFor, stopRunningClocks } from '@/features/clocks/startClocks'
import { assessFees } from '@/features/fees/assess'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const DECISION_CLOCK_KEY = 'nh.bp.decision'

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
  return assessed.ok ? ok(undefined) : err('fees_incomplete')
}

export async function runTransitionEffects(
  tx: Tx,
  app: ApplicationContext,
  to: CoreState,
  today: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  if (to === 'submitted') await startClocksFor(tx, app.id, 'application_received', today, signal)
  if (to === 'decided' || to === 'denied') {
    await markClockMet(tx, app.id, DECISION_CLOCK_KEY, today, signal)
  }
  if (to === 'issued' && app.state !== 'suspended') {
    await startClocksFor(tx, app.id, 'permit_issued', today, signal)
  }
  if (TERMINAL_STATES.includes(to)) await stopRunningClocks(tx, app.id, signal)
}
