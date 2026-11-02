import { type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { documentPrivateAccess, documentVisibleTo } from '@/features/documents/visibility'

const MIN_QUERY_LENGTH = 2
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const LIKE_SPECIALS = /[\\%_]/g
const HEADLINE = 'MaxFragments=1,MaxWords=25,MinWords=8'

export interface PublicSearchHit {
  documentId: string
  title: string
  parcelId: string | null
  snippet: string
}

export interface SearchHit extends PublicSearchHit {
  seq: number
}

type Row = {
  document_id: string
  title: string
  parcel_id: string | null
  snippet: string
  seq: string
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
}

function textMatch(q: string): SQL {
  const pattern = `%${q.replace(LIKE_SPECIALS, (c) => `\\${c}`)}%`
  return sql`(document_text.tsv @@ plainto_tsquery('english', ${q}) or document_text.text ilike ${pattern})`
}

const ORIGINAL = sql`(select dv.id from document_versions dv where dv.document_id = documents.id and dv.role = 'original' limit 1)`
const APPROVED = sql`(select ra.version_id from rendition_approvals ra where ra.document_id = documents.id and ra.purpose = 'public' and ra.revoked_at is null)`

const PREFERRED = sql`coalesce(
  (select p.id from document_versions p
    join document_text pt on pt.version_id = p.id and pt.has_text_layer
    join document_versions o on o.document_id = p.document_id and o.role = 'original'
    where p.document_id = documents.id and p.role = 'pdfa'
      and (o.content_type = 'image/tiff' or not exists (
        select 1 from document_text ot where ot.version_id = o.id and ot.has_text_layer))
    order by p.created_at desc limit 1),
  ${ORIGINAL})`

const PUBLIC_VERSION = sql`(case
  when ${APPROVED} is null then null
  when (select av.role from document_versions av where av.id = ${APPROVED}) = 'original' then ${PREFERRED}
  else ${APPROVED} end)`

function runSearch(
  db: DbOrTx,
  versionExpr: SQL,
  where: SQL,
  q: string,
  limit: number,
  after: number | null,
): Promise<{ rows: Row[] }> {
  const cursor = after === null ? sql`true` : sql`documents.seq < ${after}`
  return db.execute<Row>(sql`
    select documents.id as document_id, documents.title, documents.seq,
      (select l.parcel_id from parcel_record_links l
        where l.record_kind = 'document' and l.record_id = documents.id and l.status = 'linked' limit 1) as parcel_id,
      ts_headline('english', document_text.text, plainto_tsquery('english', ${q}), ${HEADLINE}) as snippet
    from documents
    join document_text on document_text.version_id = ${versionExpr}
    where ${where} and ${textMatch(q)} and ${cursor}
    order by documents.seq desc
    limit ${limit + 1}`)
}

function toPublicHit(row: Row | SearchHit): PublicSearchHit {
  const hit = 'document_id' in row ? toHit(row) : row
  return {
    documentId: hit.documentId,
    title: hit.title,
    parcelId: hit.parcelId,
    snippet: hit.snippet,
  }
}

function toHit(row: Row): SearchHit {
  return {
    documentId: row.document_id,
    title: row.title,
    parcelId: row.parcel_id,
    snippet: row.snippet,
    seq: Number(row.seq),
  }
}

export async function searchPublicDocuments(
  db: DbOrTx,
  input: { q: string; limit?: number },
  signal: AbortSignal,
): Promise<PublicSearchHit[]> {
  signal.throwIfAborted()
  const q = input.q.trim()
  if (q.length < MIN_QUERY_LENGTH) return []
  const limit = clampLimit(input.limit)
  const result = await runSearch(db, PUBLIC_VERSION, documentVisibleTo(null), q, limit, null)
  return result.rows.slice(0, limit).map(toPublicHit)
}

export async function searchDocuments(
  db: DbOrTx,
  actor: Actor | null,
  input: { q: string; limit?: number; cursor?: string },
  signal: AbortSignal,
): Promise<{ rows: PublicSearchHit[]; nextCursor: string | null }> {
  signal.throwIfAborted()
  const q = input.q.trim()
  if (q.length < MIN_QUERY_LENGTH) return { rows: [], nextCursor: null }
  const limit = clampLimit(input.limit)
  const after = input.cursor === undefined ? null : Number(input.cursor)
  const version = sql`case when ${documentPrivateAccess(actor)} then ${PREFERRED} else ${PUBLIC_VERSION} end`
  const result = await runSearch(
    db,
    version,
    documentVisibleTo(actor),
    q,
    limit,
    after !== null && Number.isSafeInteger(after) ? after : null,
  )
  const hits = result.rows.map(toHit)
  const page = hits.slice(0, limit)
  const last = page.at(-1)
  return {
    rows: page.map(toPublicHit),
    nextCursor: hits.length > limit && last !== undefined ? String(last.seq) : null,
  }
}
