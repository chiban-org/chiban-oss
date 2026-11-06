import { randomInt } from 'node:crypto'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { upsertAssociation } from '@/features/rosters/associations'
import { upsertPark } from '@/features/rosters/parks'
import { addRestriction } from '@/features/rosters/restrictions'
import { makeParcel } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal

export const LIST_DATE = '2027-07-01' as CivilDate

export async function freshParcel(db: Db): Promise<{ parcelId: string; ref: string }> {
  const ref = String(randomInt(100_000_000_000, 999_999_999_999))
  return { parcelId: await makeParcel(db, [{ format: 'gis12', value: ref }]), ref }
}

export async function listedAssociation(
  db: Db,
  actor: Actor,
  asOf: CivilDate = LIST_DATE,
): Promise<{ parcelId: string; entryId: string }> {
  const { parcelId } = await freshParcel(db)
  const saved = await upsertAssociation(
    db,
    actor,
    {
      parcelId,
      associationName: 'Heron Landing Condominium',
      officers: [{ name: 'Dana Whitcomb', title: 'President', mailingAddress: 'PO Box 105' }],
      asOf,
    },
    signal,
  )
  if (!saved.ok) throw new AppError(ErrorIds.DB_INVARIANT, saved.error)
  const row = await db.query.associationRosters.findFirst({
    where: (t, { eq }) => eq(t.parcelId, parcelId),
  })
  return { parcelId, entryId: row?.id ?? '' }
}

export async function listedPark(
  db: Db,
  actor: Actor,
  asOf: CivilDate = LIST_DATE,
): Promise<{ parcelId: string; entryId: string }> {
  const { parcelId } = await freshParcel(db)
  const saved = await upsertPark(
    db,
    actor,
    {
      parcelId,
      parkName: 'Loon Cove Park',
      ownerName: 'Loon Cove LLC',
      ownerMailingAddress: '1 Cove Road',
      tenants: [
        { tenantId: 'site-4', name: 'Rory Pike', siteLabel: 'Site 4', mailingAddress: '4 Court' },
      ],
      asOf,
    },
    signal,
  )
  if (!saved.ok) throw new AppError(ErrorIds.DB_INVARIANT, saved.error)
  const row = await db.query.parkRosters.findFirst({
    where: (t, { eq }) => eq(t.parcelId, parcelId),
  })
  return { parcelId, entryId: row?.id ?? '' }
}

export async function listedHolding(db: Db, actor: Actor): Promise<string> {
  const { parcelId } = await freshParcel(db)
  const added = await addRestriction(
    db,
    actor,
    {
      parcelId,
      holderName: 'Heron Land Trust',
      holderMailingAddress: '2 Trust Way',
      restrictionKind: 'conservation',
      recordedReference: 'Book 1204, page 88',
    },
    signal,
  )
  if (!added.ok) throw new AppError(ErrorIds.DB_INVARIANT, added.error)
  return added.value.holdingId
}
