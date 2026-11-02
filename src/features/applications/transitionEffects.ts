import type { Tx } from '@/db/client'
import type { ApplicationContext } from '@/features/applications/context'
import { type CoreState, TERMINAL_STATES } from '@/features/applications/states'
import type { AnyActor } from '@/features/audit/actorRef'
import { markClockMet, startClocksFor, stopRunningClocks } from '@/features/clocks/startClocks'
import { assessFees } from '@/features/fees/assess'
import type { CivilDate } from '@/types/civilDate'

const DECISION_CLOCK_KEY = 'nh.bp.decision'

export async function runTransitionEffects(
  tx: Tx,
  actor: AnyActor,
  app: ApplicationContext,
  to: CoreState,
  today: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  const payAtIntake = app.typeBody.payTiming === 'at_intake'
  if (to === 'submitted') {
    await startClocksFor(tx, app.id, 'application_received', today, signal)
    if (payAtIntake) await assessFees(tx, app.id, 'at_intake', actor, signal)
  }
  if (to === 'decided') {
    await assessFees(tx, app.id, 'at_approval', actor, signal)
  }
  if (to === 'decided' || to === 'denied') {
    await markClockMet(tx, app.id, DECISION_CLOCK_KEY, today, signal)
  }
  if (to === 'issued' && app.state === 'submitted' && !payAtIntake) {
    await assessFees(tx, app.id, 'at_approval', actor, signal)
  }
  if (to === 'issued' && app.state !== 'suspended') {
    await startClocksFor(tx, app.id, 'permit_issued', today, signal)
  }
  if (TERMINAL_STATES.includes(to)) await stopRunningClocks(tx, app.id, signal)
}
