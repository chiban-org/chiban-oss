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

interface TextRow extends HitRow {
  address_contains: boolean
  owner_contains: boolean
  address_similarity: number
  owner_similarity: number
}

function textMatchedOn(row: TextRow): MatchedOn {
  if (row.owner_contains !== row.address_contains) return row.owner_contains ? 'owner' : 'address'
  return row.owner_similarity > row.address_similarity ? 'owner' : 'address'
}

async function textHits(
  db: DbOrTx,
  q: string,
  limit: number,
): Promise<{ row: HitRow; matchedOn: MatchedOn }[]> {
  const pattern = `%${escapeLike(q)}%`
  const res = await db.execute<TextRow>(sql`
    SELECT * FROM (
      ${BASE}, NULL AS alias_format, NULL AS alias_value, NULL AS alias_status,
        COALESCE(p.site_address ILIKE ${pattern}, false) AS address_contains,
        COALESCE(p.owner_name ILIKE ${pattern}, false) AS owner_contains,
        COALESCE(similarity(p.site_address, ${q}), 0) AS address_similarity,
        COALESCE(similarity(p.owner_name, ${q}), 0) AS owner_similarity
      FROM parcels p
      WHERE p.site_address ILIKE ${pattern} OR p.owner_name ILIKE ${pattern}
        OR p.site_address % ${q} OR p.owner_name % ${q}
    ) t
    ORDER BY (address_contains OR owner_contains) DESC,
      GREATEST(address_similarity, owner_similarity) DESC, parcel_id
    LIMIT ${limit}`)
  const rows = [...res.rows]
  const exact = rows.filter((r) => r.address_contains || r.owner_contains)
  return (exact.length > 0 ? exact : rows).map((row) => ({ row, matchedOn: textMatchedOn(row) }))
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
  for (const { row, matchedOn } of await textHits(db, q, limit)) add([row], matchedOn)
  return [...hits.values()].slice(0, limit)
}

export const PARCEL_PAGE_SIZE = DEFAULT_LIMIT

export async function searchParcelPage(
  db: DbOrTx,
  q: string,
  signal: AbortSignal,
): Promise<{ hits: ParcelSearchHit[]; more: boolean }> {
  const found = await searchParcels(db, { q, limit: PARCEL_PAGE_SIZE + 1 }, signal)
  return { hits: found.slice(0, PARCEL_PAGE_SIZE), more: found.length > PARCEL_PAGE_SIZE }
}
