import '@/features/applications/recordSource'
import '@/features/documents/recordSource'
import '@/features/enforcement/recordSource'
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
  recordHref: string | null
  namedId: string
  idType: string
}

interface RecordName {
  name: string
  href: string | null
}

async function recordNames(
  db: DbOrTx,
  links: { recordKind: string; recordId: string }[],
  actor: Actor,
  signal: AbortSignal,
): Promise<Map<string, RecordName>> {
  const names = new Map<string, RecordName>()
  for (const source of parcelRecordSources()) {
    const ids = [
      ...new Set(links.filter((l) => l.recordKind === source.kind).map((l) => l.recordId)),
    ]
    if (ids.length === 0) continue
    for (const s of await source.summarize(db, ids, { kind: 'actor', actor }, signal)) {
      names.set(`${s.kind}:${s.recordId}`, {
        name: s.number === null ? s.title : `${s.title}, ${s.number}`,
        href: s.href,
      })
    }
  }
  return names
}

function idType(format: string | null, labels: ReadonlyMap<string, string>): string {
  if (format === null) return 'Not given'
  return labels.get(format) ?? 'Unlisted format'
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
  return links.map((link) => {
    const named = names.get(`${link.recordKind}:${link.recordId}`)
    return {
      linkId: link.id,
      record: named?.name ?? words(link.recordKind),
      recordHref: named?.href ?? null,
      namedId: link.rawRefValue ?? 'Unknown',
      idType: idType(link.rawRefFormat, formats),
    }
  })
}
