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
import { displayIdsFor } from '@/features/parcels/displayId'
import { isDue, lastChecked } from '@/features/rosters/recheck'
import { endingUsed } from '@/features/rosters/restrictionEnd'
import type { RestrictionKind } from '@/features/rosters/restrictions'
import { type ListUse, listsUsing } from '@/features/rosters/usedBy'
import { type EarlierVersion, earlierVersions } from '@/features/rosters/versions'
import { formatCivilDate } from '@/lib/formatDate'
import { type CivilDate, compareCivil } from '@/types/civilDate'

export const RESTRICTION_LABELS = {
  conservation: 'Conservation easement',
  preservation: 'Preservation easement',
  agricultural_preservation: 'Agricultural preservation restriction',
} as const

export interface EntryMeta {
  entryId: string
  parcelId: string
  parcel: string
  checkedText: string
  due: boolean
  uses: ListUse[]
  versions: EarlierVersion[]
}

export type AssociationRow = EntryMeta & {
  name: string
  officers: AssociationOfficer[]
  asOf: string
}

export type ParkRow = EntryMeta & {
  name: string
  owner: string
  ownerMailingAddress: string
  tenants: ParkTenant[]
  asOf: string
}

export type HoldingRow = EntryMeta & {
  holder: string
  holderMailingAddress: string
  kind: RestrictionKind
  kindText: string
  reference: string
  statusText: string
  endedOn: string | null
  active: boolean
  undoable: boolean
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

function checkedText(checked: CivilDate | null): string {
  return checked === null ? 'Never checked' : `Checked ${formatCivilDate(checked)}`
}

function holdingStatus(endedOn: string | null, today: CivilDate): [string, boolean] {
  if (endedOn === null) return ['Active', true]
  const future = compareCivil(endedOn as CivilDate, today) > 0
  return [`${future ? 'Ends' : 'Ended'} ${formatCivilDate(endedOn)}`, future]
}

async function selectRows(db: DbOrTx, parcelId: string | null) {
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

export async function loadContactRows(
  db: DbOrTx,
  input: RowContext & { parcelId: string | null },
  signal: AbortSignal,
): Promise<ContactRows> {
  const { associations, parks, holdings } = await selectRows(db, input.parcelId)
  const parcelIds = [...associations, ...parks, ...holdings].map((r) => r.parcelId)
  const labels = await displayIdsFor(db, parcelIds)
  const uses = await listsUsing(
    db,
    [...associations, ...parks, ...holdings].map((r) => r.id),
    signal,
  )
  const history = async (kind: 'association' | 'park' | 'restriction', ids: string[]) =>
    await earlierVersions(db, { kind, parcelIds: ids, timeZone: input.timeZone })
  const associationHistory = await history(
    'association',
    associations.map((a) => a.parcelId),
  )
  const parkHistory = await history(
    'park',
    parks.map((p) => p.parcelId),
  )
  const holdingHistory = await history(
    'restriction',
    holdings.map((h) => h.parcelId),
  )
  const meta = (
    row: { id: string; parcelId: string },
    checked: CivilDate | null,
    versions: EarlierVersion[],
  ): EntryMeta => ({
    entryId: row.id,
    parcelId: row.parcelId,
    parcel: labels.get(row.parcelId) ?? 'Parcel',
    checkedText: checkedText(checked),
    due: isDue(checked, input.today, input.recheckDays),
    uses: uses.get(row.id) ?? [],
    versions,
  })
  const restrictions: HoldingRow[] = []
  for (const h of holdings) {
    const [statusText, active] = holdingStatus(h.endedOn, input.today)
    const checked = h.checkedOn as CivilDate | null
    restrictions.push({
      ...meta(h, checked, holdingHistory.get(h.id) ?? []),
      due: active && isDue(checked, input.today, input.recheckDays),
      holder: h.holderName,
      holderMailingAddress: h.holderMailingAddress,
      kind: h.restrictionKind,
      kindText: RESTRICTION_LABELS[h.restrictionKind],
      reference: h.recordedReference,
      statusText,
      endedOn: h.endedOn,
      active,
      undoable: h.endedOn !== null && !(await endingUsed(db, h)),
    })
  }
  return {
    associations: associations.map((a) => ({
      ...meta(a, lastChecked(a.asOf, a.checkedOn), associationHistory.get(a.parcelId) ?? []),
      name: a.associationName,
      officers: a.officers,
      asOf: a.asOf,
    })),
    parks: parks.map((p) => ({
      ...meta(p, lastChecked(p.asOf, p.checkedOn), parkHistory.get(p.parcelId) ?? []),
      name: p.parkName,
      owner: p.ownerName,
      ownerMailingAddress: p.ownerMailingAddress,
      tenants: p.tenants,
      asOf: p.asOf,
    })),
    restrictions,
  }
}
