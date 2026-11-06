import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { type PageWindow, pageWindow } from '@/features/dataTable/pageSlice'

export interface BrowsedParcel {
  parcelId: string
  displayId: string | null
  status: 'active' | 'retired'
  siteAddress: string | null
  ownerName: string | null
}

interface BrowseRow extends Record<string, unknown> {
  parcel_id: string
  display_id: string | null
  status: 'active' | 'retired'
  site_address: string | null
  owner_name: string | null
}

export async function browseParcels(
  db: DbOrTx,
  input: { offset: number; limit: number },
  signal: AbortSignal,
): Promise<PageWindow & { rows: BrowsedParcel[] }> {
  signal.throwIfAborted()
  const counted = await db.execute<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM parcels`,
  )
  const total = counted.rows[0]?.total ?? 0
  const lastPage = total === 0 ? 0 : Math.floor((total - 1) / input.limit) * input.limit
  const offset = Math.min(input.offset, lastPage)
  const res = await db.execute<BrowseRow>(sql`
    SELECT p.id AS parcel_id, d.value AS display_id, p.status, p.site_address, p.owner_name
    FROM parcels p
    LEFT JOIN LATERAL (
      SELECT a.value FROM parcel_aliases a
      JOIN parcel_id_formats f ON f.key = a.format AND f.is_display
      WHERE a.parcel_id = p.id
      ORDER BY (a.status = 'active') DESC, a.value
      LIMIT 1
    ) d ON true
    ORDER BY d.value ASC NULLS LAST, p.id
    LIMIT ${input.limit} OFFSET ${offset}`)
  return {
    ...pageWindow(offset, input.limit, total),
    rows: res.rows.map((row) => ({
      parcelId: row.parcel_id,
      displayId: row.display_id,
      status: row.status,
      siteAddress: row.site_address,
      ownerName: row.owner_name,
    })),
  }
}
