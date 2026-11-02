import type { Tx } from '@/db/client'
import { nextNumber } from '@/features/applications/createApplication'
import { townToday } from '@/features/town/today'
import { type CivilDate, civilYear } from '@/types/civilDate'

export async function nextEnforcementNumber(
  tx: Tx,
  prefix: 'EC' | 'CP' | 'CD',
  now: Date,
  signal: AbortSignal,
): Promise<{ number: string; today: CivilDate }> {
  const today = await townToday(tx, now, signal)
  return { number: await nextNumber(tx, prefix, civilYear(today)), today }
}
