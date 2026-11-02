import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { uuidArray } from '@/db/uuidList'

export async function adjacentParcels(
  tx: DbOrTx,
  applicantParcelIds: string[],
  toleranceFt: number,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted()
  if (applicantParcelIds.length === 0) return []
  const result = await tx.execute<{ id: string }>(sql`
    select p.id
    from parcels p
    where p.geom is not null
      and p.status = 'active'
      and p.id <> all(${uuidArray(applicantParcelIds)})
      and ST_DWithin(
        ST_Transform(p.geom, 3437),
        (select ST_Transform(ST_Union(a.geom), 3437)
           from parcels a where a.id = any(${uuidArray(applicantParcelIds)})),
        ${toleranceFt}
      )
    order by p.id
  `)
  return result.rows.map((r) => r.id)
}
