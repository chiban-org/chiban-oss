import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Tx } from '@/db/client'
import { loadApplicationContext } from '@/features/applications/context'
import {
  recordIssuedDecisionTx,
  recordStaffDecisionTx,
} from '@/features/applications/staffDecision'
import type { CoreState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { boardOfApplication } from '@/features/boards/boardOf'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { CivilDate } from '@/types/civilDate'

const DEMO_DENIAL_REASON = 'The plans do not meet the side setback in the zoning ordinance.'

export async function recordSeedDecision(
  tx: Tx,
  actor: Actor,
  move: { applicationId: string; to: CoreState; on: CivilDate },
  deps: { store: ObjectStore; signal: AbortSignal },
): Promise<void> {
  if (move.to === 'issued') {
    await recordIssuedDecisionTx(tx, actor, move.applicationId, deps.signal)
    return
  }
  if (move.to !== 'decided' && move.to !== 'denied') return
  const app = await loadApplicationContext(tx, move.applicationId, deps.signal)
  if (app === null || boardOfApplication(app) !== null) return
  const recorded = await recordStaffDecisionTx(
    tx,
    actor,
    {
      applicationId: move.applicationId,
      outcome: move.to,
      reason: move.to === 'denied' ? DEMO_DENIAL_REASON : null,
      decidedOn: move.on,
    },
    deps.store,
    deps.signal,
  )
  if (!recorded.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Demo seed step failed: staff decision', {
      error: recorded.error,
    })
  }
}
