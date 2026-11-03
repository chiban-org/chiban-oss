import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'

export interface SearchExample {
  address: string | null
  displayId: string | null
}

interface ExampleRow extends Record<string, unknown> {
  display_id: string | null
  site_address: string | null
}

export async function searchExample(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<SearchExample | null> {
  signal.throwIfAborted()
  const res = await db.execute<ExampleRow>(sql`
    SELECT p.site_address,
      (SELECT a.value FROM parcel_aliases a JOIN parcel_id_formats f ON f.key = a.format AND f.is_display
         WHERE a.parcel_id = p.id AND a.status = 'active' ORDER BY a.value LIMIT 1) AS display_id
    FROM parcels p
    WHERE p.status = 'active' AND p.site_address IS NOT NULL AND p.site_address <> ''
    ORDER BY display_id NULLS LAST, p.site_address
    LIMIT 1`)
  const row = res.rows[0]
  if (row === undefined) return null
  return { address: row.site_address, displayId: row.display_id }
}
