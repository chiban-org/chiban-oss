import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  type Contact,
  getRegionalContacts,
  type RegionalContactsBody,
} from '@/features/boards/regionalContacts'
import type { PageWindow } from '@/features/dataTable/pageSlice'
import { slicePage } from '@/features/dataTable/pageSlice'
import {
  CONTACTS_PAGE_SIZE,
  type ContactsQuery,
  readContactsQuery,
} from '@/features/rosters/contactListParams'
import { matchesSearch, searchTextOf } from '@/features/rosters/contactListQuery'
import { type ContactsOverview, loadContactsOverview } from '@/features/rosters/contactPage'
import { type CondoGap, condoGaps } from '@/features/rosters/gaps'
import { mayManageAbutters } from '@/features/rosters/manage'
import { isDue, recheckDays } from '@/features/rosters/recheck'
import { type RosterStatus, rosterStatus } from '@/features/rosters/reviews'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { todayInTimeZone } from '@/types/civilDate'

export { RESTRICTION_LABELS } from '@/features/rosters/contactRows'

export interface RostersView extends ContactsOverview {
  query: ContactsQuery
  today: string
  recheckDays: number
  dueCount: number
  landRecords: { text: string; due: boolean }
  gapCount: number
  gaps: PageWindow & { rows: CondoGap[] }
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

function gapPage(gaps: readonly CondoGap[], query: ContactsQuery) {
  const found = gaps.filter((g) =>
    matchesSearch(searchTextOf([g.parcel, g.siteAddress]), query.search),
  )
  return slicePage(found, query.offset, CONTACTS_PAGE_SIZE)
}

export async function loadRostersView(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
  options: { query?: ContactsQuery; now?: Date } = {},
): Promise<RostersView | null> {
  const { now = new Date() } = options
  const askedFor = options.query ?? readContactsQuery({}).query
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return null
  const town = await getTownSettings(db, signal)
  const timeZone = town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE
  const today = todayInTimeZone(timeZone, now)
  const days = await recheckDays(db, signal)
  const gaps = await condoGaps(db, signal, null, today)
  const query =
    askedFor.tab === 'missing' && gaps.length === 0
      ? { ...askedFor, tab: 'associations' as const }
      : askedFor
  const overview = await loadContactsOverview(
    db,
    { today, recheckDays: days, timeZone, query },
    signal,
  )
  const review = await rosterStatus(db, 'restrictions', today, signal)
  const { totals } = overview
  return {
    ...overview,
    query,
    today,
    recheckDays: days,
    dueCount: totals.associations.due + totals.parks.due + totals.holders.due,
    landRecords: {
      text: landRecordsText(review),
      due: isDue(review.reviewedOn, today, days),
    },
    gapCount: gaps.length,
    gaps: gapPage(query.tab === 'missing' ? gaps : [], query),
    regionalContacts: contactLines(await getRegionalContacts(db, signal)),
    canEditSettings: await hasCapability(db, actor.userId, 'config.edit', signal),
  }
}
