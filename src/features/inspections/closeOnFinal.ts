import type { Tx } from '@/db/client'
import { loadApplicationContext } from '@/features/applications/context'
import type { CoreState } from '@/features/applications/states'
import { setSubstep, transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import type { GateResult } from '@/features/gates/evaluateGates'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const CERTIFICATE_PENDING_SUBSTEP = 'co_pending'

export type CloseOnFinalError = 'forbidden' | { gateBlocked: GateResult[] }

export async function applyPassedFinal(
  tx: Tx,
  actor: Actor,
  applicationId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<Result<{ applicationState: CoreState; closed: boolean }, CloseOnFinalError>> {
  const app = await loadApplicationContext(tx, applicationId, signal)
  if (app === null) return err('forbidden')
  if (app.typeBody.workflow.closesOn === 'certificate_of_occupancy') {
    const moved = await setSubstep(
      tx,
      actor,
      {
        applicationId,
        substep: CERTIFICATE_PENDING_SUBSTEP,
        expectedRowVersion: app.rowVersion,
      },
      signal,
    )
    if (!moved.ok && moved.error === 'forbidden') return err('forbidden')
    return ok({ applicationState: app.state, closed: false })
  }
  const closed = await transitionApplication(
    tx,
    actor,
    {
      applicationId,
      to: 'closed',
      closureReason: 'final_inspection_passed',
      expectedRowVersion: app.rowVersion,
      onDate: today,
    },
    signal,
  )
  if (closed.ok) return ok({ applicationState: 'closed', closed: true })
  if (typeof closed.error === 'object') return err(closed.error)
  return err('forbidden')
}
