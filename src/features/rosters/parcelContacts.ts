import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { type ContactRows, loadContactRows } from '@/features/rosters/contactRows'
import { condoGaps } from '@/features/rosters/gaps'
import { mayManageAbutters } from '@/features/rosters/manage'
import { recheckDays } from '@/features/rosters/recheck'
import { getTownSettings } from '@/features/town/settings'
import { todayInTimeZone } from '@/types/civilDate'

export interface ParcelContacts extends ContactRows {
  today: string
  missingAssociation: { units: number } | null
  empty: boolean
}

export async function loadParcelContacts(
  db: Db,
  actor: Actor,
  input: { parcelId: string; now?: Date },
  signal: AbortSignal,
): Promise<ParcelContacts | null> {
  const { parcelId, now = new Date() } = input
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return null
  const town = await getTownSettings(db, signal)
  const timeZone = town.ok ? town.value.timeZone : 'UTC'
  const today = todayInTimeZone(timeZone, now)
  const rows = await loadContactRows(
    db,
    { today, recheckDays: await recheckDays(db, signal), timeZone, parcelId },
    signal,
  )
  const restrictions = rows.restrictions.filter((r) => r.active)
  const [gap] = await condoGaps(db, signal, parcelId)
  const missingAssociation = gap === undefined ? null : { units: gap.units }
  return {
    ...rows,
    restrictions,
    today,
    missingAssociation,
    empty:
      rows.associations.length + rows.parks.length + restrictions.length === 0 &&
      missingAssociation === null,
  }
}
