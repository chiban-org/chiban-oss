import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { normalizeId } from '@/features/parcels/idFormats'

export type MatchedOn = 'alias_exact' | 'alias_prefix' | 'address' | 'owner'

export interface ParcelSearchHit {
  parcelId: string
  displayId: string | null
  status: 'active' | 'retired'
  siteAddress: string | null
  ownerName: string | null
  matchedOn: MatchedOn
  matchedAlias: { format: string; value: string; status: 'active' | 'retired' } | null
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MIN_QUERY_CHARS = 2
const MIN_PREFIX_CHARS = 3

interface HitRow extends Record<string, unknown> {
  parcel_id: string
  display_id: string | null
  status: 'active' | 'retired'
  site_address: string | null
  owner_name: string | null
  alias_format: string | null
  alias_value: string | null
  alias_status: 'active' | 'retired' | null
}

const BASE = sql`
  SELECT p.id AS parcel_id,
    (SELECT a.value FROM parcel_aliases a JOIN parcel_id_formats f ON f.key = a.format AND f.is_display
       WHERE a.parcel_id = p.id ORDER BY (a.status = 'active') DESC, a.value LIMIT 1) AS display_id,
    p.status, p.site_address, p.owner_name`

function toHit(row: HitRow, matchedOn: MatchedOn): ParcelSearchHit {
  return {
    parcelId: row.parcel_id,
    displayId: row.display_id,
    status: row.status,
    siteAddress: row.site_address,
    ownerName: row.owner_name,
    matchedOn,
    matchedAlias:
      row.alias_format === null || row.alias_value === null || row.alias_status === null
        ? null
        : { format: row.alias_format, value: row.alias_value, status: row.alias_status },
  }
}

function byDisplayId(a: HitRow, b: HitRow): number {
  return (a.display_id ?? '').localeCompare(b.display_id ?? '')
}

async function aliasHits(
  db: DbOrTx,
  norm: string,
  prefix: boolean,
  limit: number,
): Promise<HitRow[]> {
  const condition = prefix
    ? sql`a.value_normalized LIKE ${`${norm}%`} AND a.value_normalized <> ${norm}`
    : sql`a.value_normalized = ${norm}`
  const res = await db.execute<HitRow>(sql`
    SELECT DISTINCT ON (p.id) p.id AS parcel_id,
      (SELECT d.value FROM parcel_aliases d JOIN parcel_id_formats f ON f.key = d.format AND f.is_display
         WHERE d.parcel_id = p.id ORDER BY (d.status = 'active') DESC, d.value LIMIT 1) AS display_id,
      p.status, p.site_address, p.owner_name,
      a.format AS alias_format, a.value AS alias_value, a.status AS alias_status
    FROM parcel_aliases a JOIN parcels p ON p.id = a.parcel_id
    WHERE ${condition}
    ORDER BY p.id, (a.status = 'active') DESC, a.value
    LIMIT ${limit}`)
  return [...res.rows].sort(byDisplayId)
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`)
}

async function textHits(
  db: DbOrTx,
  column: 'site_address' | 'owner_name',
  q: string,
  limit: number,
): Promise<HitRow[]> {
  const col = sql.raw(`p.${column}`)
  const res = await db.execute<HitRow>(sql`
    ${BASE}, NULL AS alias_format, NULL AS alias_value, NULL AS alias_status
    FROM parcels p
    WHERE ${col} ILIKE ${`%${escapeLike(q)}%`} OR ${col} % ${q}
    ORDER BY similarity(${col}, ${q}) DESC, p.id LIMIT ${limit}`)
  return [...res.rows].sort(byDisplayId)
}

export async function searchParcels(
  db: DbOrTx,
  input: { q: string; limit?: number },
  signal: AbortSignal,
): Promise<ParcelSearchHit[]> {
  signal.throwIfAborted()
  const q = input.q.trim()
  if (q.length < MIN_QUERY_CHARS) return []
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const norm = normalizeId(q)
  const hits = new Map<string, ParcelSearchHit>()
  const add = (rows: HitRow[], matchedOn: MatchedOn) => {
    for (const row of rows)
      if (!hits.has(row.parcel_id)) hits.set(row.parcel_id, toHit(row, matchedOn))
  }
  if (norm.length >= MIN_QUERY_CHARS) add(await aliasHits(db, norm, false, limit), 'alias_exact')
  if (norm.length >= MIN_PREFIX_CHARS) add(await aliasHits(db, norm, true, limit), 'alias_prefix')
  add(await textHits(db, 'site_address', q, limit), 'address')
  add(await textHits(db, 'owner_name', q, limit), 'owner')
  return [...hits.values()].slice(0, limit)
}
