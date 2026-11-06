import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  type Contact,
  getRegionalContacts,
  type RegionalContactsBody,
} from '@/features/boards/regionalContacts'
import { type ContactRows, loadContactRows } from '@/features/rosters/contactRows'
import { type CondoGap, condoGaps } from '@/features/rosters/gaps'
import { mayManageAbutters } from '@/features/rosters/manage'
import { isDue, recheckDays } from '@/features/rosters/recheck'
import { type RosterStatus, rosterStatus } from '@/features/rosters/reviews'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { todayInTimeZone } from '@/types/civilDate'

export { RESTRICTION_LABELS } from '@/features/rosters/contactRows'

export interface RostersView extends ContactRows {
  today: string
  recheckDays: number
  dueCount: number
  landRecords: { text: string; due: boolean }
  gaps: CondoGap[]
  regionalContacts: { role: string; lines: string[] }[]
  canEditSettings: boolean
}

const FALLBACK_TIME_ZONE = 'UTC'

function contactLines(contacts: RegionalContactsBody): { role: string; lines: string[] }[] {
  const line = (c: Contact) => `${c.name}, ${c.mailingAddress}`
  return [
    {
      role: 'Regional planning commission',
      lines: contacts.commission === null ? [] : [line(contacts.commission)],
    },
    { role: 'Affected municipalities', lines: contacts.municipalities.map(line) },
    { role: 'NH DES', lines: contacts.nhDes === null ? [] : [line(contacts.nhDes)] },
  ]
}

export function landRecordsText(status: RosterStatus): string {
  if (status.state === 'never_reviewed') return 'Land records not yet checked for restrictions'
  return `Land records checked for new restrictions on ${formatCivilDate(status.reviewedOn ?? '')}`
}

export async function loadRostersView(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<RostersView | null> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return null
  const town = await getTownSettings(db, signal)
  const timeZone = town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE
  const today = todayInTimeZone(timeZone, now)
  const days = await recheckDays(db, signal)
  const rows = await loadContactRows(
    db,
    { today, recheckDays: days, timeZone, parcelId: null },
    signal,
  )
  const review = await rosterStatus(db, 'restrictions', today, signal)
  const all = [...rows.associations, ...rows.parks, ...rows.restrictions]
  return {
    ...rows,
    today,
    recheckDays: days,
    dueCount: all.filter((r) => r.due).length,
    landRecords: {
      text: landRecordsText(review),
      due: isDue(review.reviewedOn, today, days),
    },
    gaps: await condoGaps(db, signal, null, today),
    regionalContacts: contactLines(await getRegionalContacts(db, signal)),
    canEditSettings: await hasCapability(db, actor.userId, 'config.edit', signal),
  }
}
