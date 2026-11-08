import { asc, eq } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { DbOrTx } from '@/db/client'
import {
  type AssociationOfficer,
  associationRosters,
  type ParkTenant,
  parkRosters,
  restrictionHoldings,
} from '@/db/schema'
import type { EntryKind } from '@/features/rosters/confirm'
import { type EnrichInput, enrichmentFor } from '@/features/rosters/contactEnrich'
import {
  type AssociationRecord,
  type Enrichment,
  type EntryRecord,
  type HoldingRecord,
  type ParkRecord,
  shapeAssociation,
  shapeHolding,
  shapePark,
} from '@/features/rosters/contactShape'
import type { RestrictionKind } from '@/features/rosters/restrictions'
import type { ListUse } from '@/features/rosters/usedBy'
import type { EarlierVersion } from '@/features/rosters/versions'
import type { CivilDate } from '@/types/civilDate'

export { RESTRICTION_LABELS } from '@/features/rosters/contactShape'

export interface EntryMeta {
  entryId: string
  parcelId: string
  parcel: string
  checkedText: string
  due: boolean
  uses: ListUse[]
  versions: EarlierVersion[]
}

export interface EndState {
  statusText: string
  endedOn: string | null
  active: boolean
  undoable: boolean
}

export type AssociationRow = EntryMeta &
  EndState & {
    name: string
    officers: AssociationOfficer[]
    asOf: string
  }

export type ParkRow = EntryMeta &
  EndState & {
    name: string
    owner: string
    ownerMailingAddress: string
    tenants: ParkTenant[]
    asOf: string
  }

export type HoldingRow = EntryMeta &
  EndState & {
    holder: string
    holderMailingAddress: string
    kind: RestrictionKind
    kindText: string
    reference: string
  }

export interface ContactRows {
  associations: AssociationRow[]
  parks: ParkRow[]
  restrictions: HoldingRow[]
}

export interface RowContext {
  today: CivilDate
  recheckDays: number
  timeZone: string
}

export interface EntryRecords {
  associations: AssociationRecord[]
  parks: ParkRecord[]
  holdings: HoldingRecord[]
}

export async function selectEntryRecords(
  db: DbOrTx,
  parcelId: string | null,
): Promise<EntryRecords> {
  const onParcel = (column: AnyPgColumn) => (parcelId === null ? undefined : eq(column, parcelId))
  return {
    associations: await db
      .select()
      .from(associationRosters)
      .where(onParcel(associationRosters.parcelId))
      .orderBy(asc(associationRosters.associationName)),
    parks: await db
      .select()
      .from(parkRosters)
      .where(onParcel(parkRosters.parcelId))
      .orderBy(asc(parkRosters.parkName)),
    holdings: await db
      .select()
      .from(restrictionHoldings)
      .where(onParcel(restrictionHoldings.parcelId))
      .orderBy(asc(restrictionHoldings.holderName)),
  }
}

export interface EnrichShape<R, S> {
  kind: EntryKind
  shape: (row: R, e: Enrichment) => S
}

export async function shapedRows<R extends EntryRecord, S>(
  db: DbOrTx,
  rows: { shown: readonly R[]; siblings: readonly R[] },
  input: Omit<EnrichInput, 'kind'> & EnrichShape<R, S>,
  signal: AbortSignal,
): Promise<S[]> {
  const enrichment = await enrichmentFor(db, rows, input, signal)
  return rows.shown.map((row) => input.shape(row, enrichment))
}

export async function loadContactRows(
  db: DbOrTx,
  input: RowContext & { parcelId: string | null },
  signal: AbortSignal,
): Promise<ContactRows> {
  const records = await selectEntryRecords(db, input.parcelId)
  const all = <R extends EntryRecord>(rows: R[]) => ({ shown: rows, siblings: rows })
  return {
    associations: await shapedRows(
      db,
      all(records.associations),
      { ...input, kind: 'association', shape: shapeAssociation },
      signal,
    ),
    parks: await shapedRows(
      db,
      all(records.parks),
      { ...input, kind: 'park', shape: shapePark },
      signal,
    ),
    restrictions: await shapedRows(
      db,
      all(records.holdings),
      { ...input, kind: 'restriction', shape: shapeHolding },
      signal,
    ),
  }
}
