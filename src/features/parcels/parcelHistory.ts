import { and, eq } from 'drizzle-orm'
import '@/features/applications/recordSource'
import '@/features/documents/recordSource'
import '@/features/historical/recordSource'
import '@/features/inspections/recordSource'
import type { DbOrTx } from '@/db/client'
import { parcelRecordCarryForwards, parcelRecordLinks } from '@/db/schema'
import { listAncestors } from '@/features/parcels/ancestors'
import { displayIdsFor } from '@/features/parcels/displayId'
import {
  type ParcelRecordSummary,
  parcelRecordSources,
  type Viewer,
} from '@/features/parcels/recordSources'
import { civilYear } from '@/types/civilDate'

export type OwnRecord = ParcelRecordSummary & {
  carriedFrom?: { parcelId: string; displayId: string }
}

export type AncestralRecord = ParcelRecordSummary & { linkId?: string }

export interface AncestralGroup {
  parcelId: string
  displayId: string
  label: string
  records: AncestralRecord[]
}

export interface ParcelHistory {
  own: OwnRecord[]
  ancestral: AncestralGroup[]
  sourcesRegistered: number
}

const KIND_WORDS: Record<string, string> = {
  subdivision: 'subdivision',
  merge: 'merge',
  lot_line_adjustment: 'lot-line adjustment',
}

interface LinkRef {
  linkId: string
  kind: string
  recordId: string
}

async function summaries(
  db: DbOrTx,
  links: LinkRef[],
  viewer: Viewer,
  signal: AbortSignal,
): Promise<Map<string, ParcelRecordSummary>> {
  const result = new Map<string, ParcelRecordSummary>()
  for (const source of parcelRecordSources()) {
    const ids = [...new Set(links.filter((l) => l.kind === source.kind).map((l) => l.recordId))]
    if (ids.length === 0) continue
    for (const s of await source.summarize(db, ids, viewer, signal)) {
      result.set(`${s.kind}:${s.recordId}`, s)
    }
  }
  return result
}

async function linksOf(db: DbOrTx, parcelId: string): Promise<LinkRef[]> {
  return await db
    .select({
      linkId: parcelRecordLinks.id,
      kind: parcelRecordLinks.recordKind,
      recordId: parcelRecordLinks.recordId,
    })
    .from(parcelRecordLinks)
    .where(and(eq(parcelRecordLinks.parcelId, parcelId), eq(parcelRecordLinks.status, 'linked')))
}

async function carriedTo(db: DbOrTx, parcelId: string) {
  return await db
    .select({
      linkId: parcelRecordLinks.id,
      kind: parcelRecordLinks.recordKind,
      recordId: parcelRecordLinks.recordId,
      fromParcelId: parcelRecordLinks.parcelId,
    })
    .from(parcelRecordCarryForwards)
    .innerJoin(parcelRecordLinks, eq(parcelRecordLinks.id, parcelRecordCarryForwards.linkId))
    .where(eq(parcelRecordCarryForwards.toParcelId, parcelId))
}

export async function getParcelHistory(
  db: DbOrTx,
  parcelId: string,
  viewer: Viewer,
  signal: AbortSignal,
): Promise<ParcelHistory> {
  signal.throwIfAborted()
  const ownLinks = await linksOf(db, parcelId)
  const carried = await carriedTo(db, parcelId)
  const carriedIds = new Set(carried.map((c) => c.linkId))
  const ancestors = await listAncestors(db, parcelId, signal)
  const ancestorLinks = new Map<string, LinkRef[]>()
  for (const a of ancestors) ancestorLinks.set(a.parcelId, await linksOf(db, a.parcelId))
  const allLinks = [...ownLinks, ...carried, ...[...ancestorLinks.values()].flat()]
  const found = await summaries(db, allLinks, viewer, signal)
  const display = await displayIdsFor(db, [
    ...ancestors.map((a) => a.parcelId),
    ...carried.flatMap((c) => (c.fromParcelId === null ? [] : [c.fromParcelId])),
  ])

  const own: OwnRecord[] = ownLinks.flatMap((l) => {
    const s = found.get(`${l.kind}:${l.recordId}`)
    return s === undefined ? [] : [s]
  })
  for (const c of carried) {
    const s = found.get(`${c.kind}:${c.recordId}`)
    if (s === undefined || c.fromParcelId === null) continue
    own.push({
      ...s,
      carriedFrom: { parcelId: c.fromParcelId, displayId: display.get(c.fromParcelId) ?? '' },
    })
  }

  const ancestral: AncestralGroup[] = []
  for (const a of ancestors) {
    const records = (ancestorLinks.get(a.parcelId) ?? [])
      .filter((l) => !carriedIds.has(l.linkId))
      .flatMap((l): AncestralRecord[] => {
        const s = found.get(`${l.kind}:${l.recordId}`)
        if (s === undefined) return []
        return [viewer.kind === 'actor' ? { ...s, linkId: l.linkId } : s]
      })
    if (records.length === 0) continue
    const displayId = display.get(a.parcelId) ?? ''
    const kind = KIND_WORDS[a.eventKind] ?? a.eventKind
    ancestral.push({
      parcelId: a.parcelId,
      displayId,
      label: `from parent lot ${displayId}, before the ${civilYear(a.effectiveDate)} ${kind}`,
      records,
    })
  }
  return { own, ancestral, sourcesRegistered: parcelRecordSources().length }
}
