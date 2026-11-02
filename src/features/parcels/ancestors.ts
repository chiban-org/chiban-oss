import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import type { CivilDate } from '@/types/civilDate'

export interface Ancestor {
  parcelId: string
  depth: number
  eventId: string
  eventKind: string
  effectiveDate: CivilDate
}

interface AncestorRow extends Record<string, unknown> {
  parcel_id: string
  depth: number
  event_id: string
  kind: string
  effective_date: string
}

export async function listAncestors(
  db: DbOrTx,
  parcelId: string,
  signal: AbortSignal,
): Promise<Ancestor[]> {
  signal.throwIfAborted()
  const res = await db.execute<AncestorRow>(sql`
    WITH RECURSIVE anc(parcel_id, depth, event_id, path) AS (
      SELECT p.parcel_id, 1, c.event_id, ARRAY[${parcelId}::uuid, p.parcel_id]
      FROM parcel_lineage_links c
      JOIN parcel_lineage_links p ON p.event_id = c.event_id AND p.role = 'parent'
      WHERE c.parcel_id = ${parcelId}::uuid AND c.role = 'child' AND p.parcel_id <> c.parcel_id
      UNION ALL
      SELECT p.parcel_id, a.depth + 1, c.event_id, a.path || p.parcel_id
      FROM anc a
      JOIN parcel_lineage_links c ON c.parcel_id = a.parcel_id AND c.role = 'child'
      JOIN parcel_lineage_links p ON p.event_id = c.event_id AND p.role = 'parent'
      WHERE p.parcel_id <> c.parcel_id AND NOT p.parcel_id = ANY(a.path)
    ), nearest AS (
      SELECT DISTINCT ON (parcel_id) parcel_id, depth, event_id FROM anc ORDER BY parcel_id, depth
    )
    SELECT n.parcel_id, n.depth, n.event_id, e.kind,
           to_char(e.effective_date, 'YYYY-MM-DD') AS effective_date
    FROM nearest n JOIN parcel_lineage_events e ON e.id = n.event_id
    ORDER BY n.depth, n.parcel_id`)
  return res.rows.map((r) => ({
    parcelId: r.parcel_id,
    depth: r.depth,
    eventId: r.event_id,
    eventKind: r.kind,
    effectiveDate: r.effective_date as CivilDate,
  }))
}
