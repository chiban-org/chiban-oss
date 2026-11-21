import type { DbOrTx, Tx } from '@/db/client'
import type { CoreState } from '@/features/applications/states'
import { holdBlocksApplication, holdSuspends } from '@/features/enforcement/holdReads'

export async function isHoldMove(
  tx: DbOrTx,
  app: { id: string; state: CoreState },
  to: CoreState,
  signal: AbortSignal,
): Promise<boolean> {
  if (app.state === 'issued') return to === 'suspended' || to === 'closed'
  return app.state === 'suspended' && to === 'closed' && (await holdSuspends(tx, app.id, signal))
}

export async function heldClose(
  tx: DbOrTx,
  app: { id: string; state: CoreState },
  input: { to: CoreState; holdId?: string },
  signal: AbortSignal,
): Promise<boolean> {
  if (input.holdId !== undefined || app.state !== 'suspended' || input.to !== 'closed') return false
  return await holdSuspends(tx, app.id, signal)
}

async function issuanceHeld(
  tx: Tx,
  app: { id: string; state: CoreState },
  input: { to: CoreState; cutover?: boolean },
  signal: AbortSignal,
): Promise<boolean> {
  if (input.to !== 'issued' || app.state === 'suspended' || input.cutover === true) return false
  return await holdBlocksApplication(tx, app.id, signal)
}

async function gatesSkipped(
  tx: Tx,
  app: { id: string; state: CoreState },
  input: { to: CoreState; holdId?: string },
  signal: AbortSignal,
): Promise<boolean> {
  if (app.state === 'suspended' && input.to === 'issued') return true
  return input.holdId !== undefined && (await isHoldMove(tx, app, input.to, signal))
}

export async function holdChecks(
  tx: Tx,
  app: { id: string; state: CoreState },
  input: { to: CoreState; cutover?: boolean; holdId?: string },
  signal: AbortSignal,
): Promise<{ issuanceHeld: boolean; skipGates: boolean }> {
  return {
    issuanceHeld: await issuanceHeld(tx, app, input, signal),
    skipGates: await gatesSkipped(tx, app, input, signal),
  }
}
