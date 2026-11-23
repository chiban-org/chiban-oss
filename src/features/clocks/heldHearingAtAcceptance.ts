import type { Tx } from '@/db/client'
import { startClocksWhenPackUses } from '@/features/clocks/startClocks'
import { electedHearing } from '@/features/hearings/electedHearing'

export async function applyHearingHeldBeforeAcceptance(
  tx: Tx,
  applicationId: string,
  signal: AbortSignal,
): Promise<void> {
  const heldOn = (await electedHearing(tx, applicationId))?.firstHeldOn ?? null
  if (heldOn === null) return
  await startClocksWhenPackUses(tx, applicationId, 'hearing_held', heldOn, signal)
}
