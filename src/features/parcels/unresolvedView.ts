import '@/features/applications/recordSource'
import '@/features/documents/recordSource'
import '@/features/historical/recordSource'
import '@/features/inspections/recordSource'
import type { DbOrTx } from '@/db/client'
import { parcelIdFormats } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { parcelRecordSources } from '@/features/parcels/recordSources'
import { listUnresolvedLinks } from '@/features/parcels/unresolvedList'
import { words } from '@/lib/words'

export interface UnresolvedRecordView {
  linkId: string
  record: string
  namedParcel: string
}

async function recordNames(
  db: DbOrTx,
  links: { recordKind: string; recordId: string }[],
  actor: Actor,
  signal: AbortSignal,
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (const source of parcelRecordSources()) {
    const ids = [
      ...new Set(links.filter((l) => l.recordKind === source.kind).map((l) => l.recordId)),
    ]
    if (ids.length === 0) continue
    for (const s of await source.summarize(db, ids, { kind: 'actor', actor }, signal)) {
      names.set(`${s.kind}:${s.recordId}`, s.number === null ? s.title : `${s.title}, ${s.number}`)
    }
  }
  return names
}

function namedParcel(value: string | null, format: string | undefined): string {
  const id = value ?? 'unknown'
  return format === undefined ? id : `${id} (${format})`
}

export async function listUnresolvedRecords(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<UnresolvedRecordView[]> {
  const links = await listUnresolvedLinks(db, signal)
  const names = await recordNames(db, links, actor, signal)
  const formats = new Map(
    (await db.select().from(parcelIdFormats)).map((f) => [f.key, f.label] as const),
  )
  return links.map((link) => ({
    linkId: link.id,
    record: names.get(`${link.recordKind}:${link.recordId}`) ?? words(link.recordKind),
    namedParcel: namedParcel(
      link.rawRefValue,
      link.rawRefFormat === null
        ? undefined
        : (formats.get(link.rawRefFormat) ?? 'unlisted format'),
    ),
  }))
}
