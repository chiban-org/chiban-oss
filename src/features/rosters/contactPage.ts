import { inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { parcels } from '@/db/schema'
import type { PageWindow } from '@/features/dataTable/pageSlice'
import { displayIdsFor } from '@/features/parcels/displayId'
import type { ContactsQuery, EntryTab } from '@/features/rosters/contactListParams'
import {
  type ContactItem,
  countItems,
  type KindCounts,
  pageOfItems,
  searchTextOf,
} from '@/features/rosters/contactListQuery'
import {
  type AssociationRow,
  type EnrichShape,
  type HoldingRow,
  type ParkRow,
  type RowContext,
  selectEntryRecords,
  shapedRows,
} from '@/features/rosters/contactRows'
import {
  checkedOf,
  type EntryRecord,
  entryStatus,
  isEntryDue,
  RESTRICTION_LABELS,
  shapeAssociation,
  shapeHolding,
  shapePark,
} from '@/features/rosters/contactShape'

interface KindList<T extends EntryTab, R> {
  tab: T
  rows: R[]
  window: PageWindow
  counts: KindCounts
}

export type ContactList =
  | KindList<'associations', AssociationRow>
  | KindList<'parks', ParkRow>
  | KindList<'holders', HoldingRow>

export interface ContactsOverview {
  totals: Record<EntryTab, KindCounts>
  list: ContactList | null
}

type Item<R> = ContactItem & { record: R }

function wordsOf(row: EntryRecord): (string | null)[] {
  if ('associationName' in row) {
    return [row.associationName, ...row.officers.flatMap((o) => [o.name, o.mailingAddress])]
  }
  if ('parkName' in row) {
    return [
      row.parkName,
      row.ownerName,
      row.ownerMailingAddress,
      ...row.tenants.flatMap((t) => [t.name, t.siteLabel, t.mailingAddress]),
    ]
  }
  return [
    row.holderName,
    row.holderMailingAddress,
    row.recordedReference,
    RESTRICTION_LABELS[row.restrictionKind],
  ]
}

function nameOf(row: EntryRecord): string {
  if ('associationName' in row) return row.associationName
  return 'parkName' in row ? row.parkName : row.holderName
}

async function siteAddresses(db: DbOrTx, ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: parcels.id, siteAddress: parcels.siteAddress })
    .from(parcels)
    .where(inArray(parcels.id, ids))
  return new Map(rows.map((r) => [r.id, r.siteAddress]))
}

function itemsOf<R extends EntryRecord>(
  rows: readonly R[],
  context: RowContext & {
    labels: ReadonlyMap<string, string>
    sites: ReadonlyMap<string, string | null>
  },
): Item<R>[] {
  return rows.map((record) => {
    const parcel = context.labels.get(record.parcelId) ?? ''
    return {
      id: record.id,
      name: nameOf(record),
      parcel,
      searchText: searchTextOf([parcel, context.sites.get(record.parcelId), ...wordsOf(record)]),
      active: entryStatus(record.endedOn, context.today)[1],
      due: isEntryDue(record, context.today, context.recheckDays),
      checked: checkedOf(record),
      record,
    }
  })
}

interface PageInput extends RowContext {
  query: ContactsQuery
}

async function kindList<T extends EntryTab, R extends EntryRecord, S>(
  db: DbOrTx,
  list: { tab: T; items: Item<R>[]; siblings: readonly R[] },
  input: PageInput & EnrichShape<R, S>,
  signal: AbortSignal,
): Promise<KindList<T, S>> {
  const page = pageOfItems(list.items, input.query)
  const rows = await shapedRows(
    db,
    { shown: page.rows.map((i) => i.record), siblings: list.siblings },
    input,
    signal,
  )
  return { tab: list.tab, rows, window: page, counts: countItems(list.items, input.query.search) }
}

export async function loadContactsOverview(
  db: DbOrTx,
  input: PageInput,
  signal: AbortSignal,
): Promise<ContactsOverview> {
  const { associations, parks, holdings } = await selectEntryRecords(db, null)
  const parcelIds = [...new Set([...associations, ...parks, ...holdings].map((r) => r.parcelId))]
  const context = {
    ...input,
    labels: await displayIdsFor(db, parcelIds),
    sites: await siteAddresses(db, parcelIds),
  }
  const items = {
    associations: itemsOf(associations, context),
    parks: itemsOf(parks, context),
    holders: itemsOf(holdings, context),
  }
  const totals = {
    associations: countItems(items.associations, ''),
    parks: countItems(items.parks, ''),
    holders: countItems(items.holders, ''),
  }
  const tab = input.query.tab
  if (tab === 'associations') {
    const list = { tab, items: items.associations, siblings: associations }
    const shape = { kind: 'association', shape: shapeAssociation } as const
    return { totals, list: await kindList(db, list, { ...input, ...shape }, signal) }
  }
  if (tab === 'parks') {
    const list = { tab, items: items.parks, siblings: parks }
    const shape = { kind: 'park', shape: shapePark } as const
    return { totals, list: await kindList(db, list, { ...input, ...shape }, signal) }
  }
  if (tab === 'holders') {
    const list = { tab, items: items.holders, siblings: holdings }
    const shape = { kind: 'restriction', shape: shapeHolding } as const
    return { totals, list: await kindList(db, list, { ...input, ...shape }, signal) }
  }
  return { totals, list: null }
}
