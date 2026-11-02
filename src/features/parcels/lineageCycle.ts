import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'

function uuidList(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
}

export async function wouldCreateCycle(
  db: DbOrTx,
  parents: string[],
  children: string[],
): Promise<boolean> {
  const res = await db.execute<{ parcel_id: string }>(sql`
    WITH RECURSIVE d(parcel_id, path) AS (
      SELECT cl.parcel_id, ARRAY[pl.parcel_id, cl.parcel_id]
      FROM parcel_lineage_links pl
      JOIN parcel_lineage_links cl ON cl.event_id = pl.event_id AND cl.role = 'child'
      WHERE pl.role = 'parent' AND pl.parcel_id IN (${uuidList(children)})
        AND cl.parcel_id <> pl.parcel_id
      UNION ALL
      SELECT cl.parcel_id, d.path || cl.parcel_id
      FROM d
      JOIN parcel_lineage_links pl ON pl.parcel_id = d.parcel_id AND pl.role = 'parent'
      JOIN parcel_lineage_links cl ON cl.event_id = pl.event_id AND cl.role = 'child'
      WHERE cl.parcel_id <> pl.parcel_id AND NOT cl.parcel_id = ANY(d.path)
    )
    SELECT parcel_id FROM d WHERE parcel_id IN (${uuidList(parents)}) LIMIT 1`)
  return res.rows.length > 0
}
