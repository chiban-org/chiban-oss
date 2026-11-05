import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { parkRosters } from '@/db/schema'
import { RECHECK_CONTACTS_DEFAULT_DAYS } from '@/features/boards/boardSettingsSchema'
import { townToday } from '@/features/town/today'
import { addDays } from '@/types/civilDate'

const DUE_PARK = 'Merganser Court'
const DAYS_PAST_DUE = 35

export async function seedNoticeContacts(
  db: Db,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<void> {
  const today = await townToday(db, now, signal)
  const lastChecked = addDays(today, -(RECHECK_CONTACTS_DEFAULT_DAYS + DAYS_PAST_DUE))
  await db
    .update(parkRosters)
    .set({ asOf: lastChecked, checkedOn: lastChecked })
    .where(eq(parkRosters.parkName, DUE_PARK))
}
