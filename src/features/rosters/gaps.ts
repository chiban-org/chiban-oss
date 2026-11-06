import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { displayIdsFor } from '@/features/parcels/displayId'
import type { CivilDate } from '@/types/civilDate'

export interface CondoGap {
  parcelId: string
  parcel: string
  siteAddress: string | null
  units: number
}

export async function condoGaps(
  db: DbOrTx,
  signal: AbortSignal,
  parcelId: string | null = null,
  today: CivilDate | null = null,
): Promise<CondoGap[]> {
  signal.throwIfAborted()
  const rows = await db.execute<{ parcel_id: string; site_address: string | null; units: number }>(
    sql`
      select pa.parcel_id, p.site_address, count(*)::int as units
      from parcel_aliases pa
      join parcels p on p.id = pa.parcel_id
      where pa.format = 'cama15' and pa.status = 'active' and p.status = 'active'
        and (${parcelId}::uuid is null or pa.parcel_id = ${parcelId}::uuid)
        and not exists (select 1 from association_rosters a where a.parcel_id = pa.parcel_id
          and (a.ended_on is null or a.ended_on > ${today}::date))
        and not exists (select 1 from park_rosters k where k.parcel_id = pa.parcel_id
          and (k.ended_on is null or k.ended_on > ${today}::date))
      group by pa.parcel_id, p.site_address
      having count(*) > 1
    `,
  )
  const labels = await displayIdsFor(
    db,
    rows.rows.map((r) => r.parcel_id),
  )
  return rows.rows
    .map((r) => ({
      parcelId: r.parcel_id,
      parcel: labels.get(r.parcel_id) ?? 'Parcel',
      siteAddress: r.site_address,
      units: r.units,
    }))
    .sort((a, b) => a.parcel.localeCompare(b.parcel))
}
