import { inArray, type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents } from '@/db/schema'

const ROUTES: ReadonlyMap<string, string> = new Map([
  ['application', '/staff/applications/'],
  ['enforcement_case', '/staff/enforcement/'],
  ['rtk_request', '/staff/records/requests/'],
  ['parcel', '/staff/parcels/'],
  ['inspection', '/staff/inspections/'],
  ['meeting', '/staff/boards/meetings/'],
])

export function staffRecordHref(kind: string | null, id: string | null): string | null {
  if (kind === null || id === null) return null
  const base = ROUTES.get(kind)
  return base === undefined ? null : `${base}${id}`
}

export function projectParcelSql(kind: SQLWrapper, id: SQLWrapper): SQL<string | null> {
  return sql<
    string | null
  >`(select p.parcel_id::text from projects p where ${kind} = 'project' and p.id = ${id})`
}

export interface OwnedRecord {
  recordKind: string
  recordId: string
  projectParcelId: string | null
}

export function ownerHref(record: OwnedRecord): string | null {
  return record.recordKind === 'project'
    ? staffRecordHref('parcel', record.projectParcelId)
    : staffRecordHref(record.recordKind, record.recordId)
}

export async function documentRecordLinks(
  db: DbOrTx,
  documentIds: readonly string[],
): Promise<Map<string, string>> {
  if (documentIds.length === 0) return new Map()
  const rows = await db
    .select({
      id: documents.id,
      recordKind: documents.recordKind,
      recordId: documents.recordId,
      projectParcelId: projectParcelSql(documents.recordKind, documents.recordId),
    })
    .from(documents)
    .where(inArray(documents.id, [...documentIds]))
  const links = new Map<string, string>()
  for (const row of rows) {
    const href = ownerHref(row)
    if (href !== null) links.set(row.id, href)
  }
  return links
}
