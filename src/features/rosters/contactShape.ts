import type { associationRosters, parkRosters, restrictionHoldings } from '@/db/schema'
import type {
  AssociationRow,
  EndState,
  EntryMeta,
  HoldingRow,
  ParkRow,
} from '@/features/rosters/contactRows'
import { isDue, lastChecked } from '@/features/rosters/recheck'
import type { ListUse } from '@/features/rosters/usedBy'
import type { EarlierVersion } from '@/features/rosters/versions'
import { formatCivilDate, formatCivilDateShort } from '@/lib/formatDate'
import { type CivilDate, compareCivil } from '@/types/civilDate'

export const RESTRICTION_LABELS = {
  conservation: 'Conservation easement',
  preservation: 'Preservation easement',
  agricultural_preservation: 'Agricultural preservation restriction',
} as const

export type AssociationRecord = typeof associationRosters.$inferSelect
export type ParkRecord = typeof parkRosters.$inferSelect
export type HoldingRecord = typeof restrictionHoldings.$inferSelect
export type EntryRecord = AssociationRecord | ParkRecord | HoldingRecord

export interface Enrichment {
  today: CivilDate
  recheckDays: number
  labels: ReadonlyMap<string, string>
  uses: ReadonlyMap<string, ListUse[]>
  versions: ReadonlyMap<string, EarlierVersion[]>
  usedEndings: ReadonlySet<string>
}

export function checkedText(checked: CivilDate | null): string {
  return checked === null ? 'Never checked' : formatCivilDate(checked)
}

export function entryStatus(endedOn: string | null, today: CivilDate): [string, boolean] {
  if (endedOn === null) return ['Active', true]
  const future = compareCivil(endedOn as CivilDate, today) > 0
  return [`${future ? 'Ends' : 'Ended'} ${formatCivilDateShort(endedOn)}`, future]
}

export function checkedOf(row: EntryRecord): CivilDate | null {
  return 'asOf' in row ? lastChecked(row.asOf, row.checkedOn) : (row.checkedOn as CivilDate | null)
}

export function isEntryDue(row: EntryRecord, today: CivilDate, recheckDays: number): boolean {
  return entryStatus(row.endedOn, today)[1] && isDue(checkedOf(row), today, recheckDays)
}

function metaAndEnd(row: EntryRecord, e: Enrichment): EntryMeta & EndState {
  const checked = checkedOf(row)
  const [statusText, active] = entryStatus(row.endedOn, e.today)
  return {
    entryId: row.id,
    parcelId: row.parcelId,
    parcel: e.labels.get(row.parcelId) ?? 'Parcel',
    checkedText: checkedText(checked),
    due: active && isDue(checked, e.today, e.recheckDays),
    uses: e.uses.get(row.id) ?? [],
    versions: e.versions.get(row.id) ?? [],
    statusText,
    endedOn: row.endedOn,
    active,
    undoable: row.endedOn !== null && !e.usedEndings.has(row.id),
  }
}

export function shapeHolding(h: HoldingRecord, e: Enrichment): HoldingRow {
  return {
    ...metaAndEnd(h, e),
    holder: h.holderName,
    holderMailingAddress: h.holderMailingAddress,
    kind: h.restrictionKind,
    kindText: RESTRICTION_LABELS[h.restrictionKind],
    reference: h.recordedReference,
  }
}

export function shapeAssociation(a: AssociationRecord, e: Enrichment): AssociationRow {
  return { ...metaAndEnd(a, e), name: a.associationName, officers: a.officers, asOf: a.asOf }
}

export function shapePark(p: ParkRecord, e: Enrichment): ParkRow {
  return {
    ...metaAndEnd(p, e),
    name: p.parkName,
    owner: p.ownerName,
    ownerMailingAddress: p.ownerMailingAddress,
    tenants: p.tenants,
    asOf: p.asOf,
  }
}
