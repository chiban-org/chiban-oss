import type { DbOrTx } from '@/db/client'
import { getBoardSettings } from '@/features/boards/boardSettings'
import { RECHECK_CONTACTS_DEFAULT_DAYS } from '@/features/boards/boardSettingsSchema'
import { type CivilDate, daysBetween } from '@/types/civilDate'

export async function recheckDays(db: DbOrTx, signal: AbortSignal): Promise<number> {
  const settings = await getBoardSettings(db, signal)
  return settings.abutters.recheckContactsDays ?? RECHECK_CONTACTS_DEFAULT_DAYS
}

export function lastChecked(asOf: string | null, checkedOn: string | null): CivilDate | null {
  if (asOf === null) return checkedOn as CivilDate | null
  if (checkedOn === null) return asOf as CivilDate
  return (checkedOn > asOf ? checkedOn : asOf) as CivilDate
}

export function isDue(checked: CivilDate | null, today: CivilDate, days: number): boolean {
  return checked === null || daysBetween(checked, today) > days
}
