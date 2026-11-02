import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { uuidArray } from '@/db/uuidList'
import { isAdjacent } from '@/features/abutters/verdicts'

const PREFILTER_MARGIN_FT = 1

export async function adjacentParcels(
  tx: DbOrTx,
  applicantParcelIds: string[],
  toleranceFt: number,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted()
  if (applicantParcelIds.length === 0) return []
  const result = await tx.execute<{ id: string; feet: number }>(sql`
    select p.id, ST_Distance(ST_Transform(p.geom, 3437), u.g)::float8 as feet
    from parcels p
    cross join lateral (
      select ST_Transform(ST_Union(a.geom), 3437) as g
      from parcels a where a.id = any(${uuidArray(applicantParcelIds)})
    ) u
    where p.geom is not null
      and p.status = 'active'
      and p.id <> all(${uuidArray(applicantParcelIds)})
      and ST_DWithin(ST_Transform(p.geom, 3437), u.g, ${toleranceFt + PREFILTER_MARGIN_FT})
    order by p.id
  `)
  return result.rows.filter((r) => isAdjacent(r.feet, toleranceFt)).map((r) => r.id)
}
