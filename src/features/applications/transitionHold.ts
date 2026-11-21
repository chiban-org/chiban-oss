import type { Tx } from '@/db/client'
import type { CoreState } from '@/features/applications/states'
import { holdBlocksApplication } from '@/features/enforcement/holdReads'

export function isHoldMove(from: CoreState, to: CoreState): boolean {
  return (from === 'issued' && to === 'suspended') || (to === 'closed' && from !== 'closed')
}

export async function issuanceHeld(
  tx: Tx,
  app: { id: string; state: CoreState },
  input: { to: CoreState; cutover?: boolean },
  signal: AbortSignal,
): Promise<boolean> {
  if (input.to !== 'issued' || app.state === 'suspended' || input.cutover === true) return false
  return await holdBlocksApplication(tx, app.id, signal)
}
