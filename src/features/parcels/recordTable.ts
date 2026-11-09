import type { OpenGroup } from '@/features/parcels/openGroups'
import type { ParcelHistory } from '@/features/parcels/parcelHistory'
import type { ParcelRecordSummary, RecordDates } from '@/features/parcels/recordSources'
import type { CivilDate } from '@/types/civilDate'

export interface RecordFile {
  id: string
  title: string
  kindLabel: string | null
  href: string | null
  visibility: ParcelRecordSummary['status']
  added: CivilDate | null
}

export interface RecordRow {
  key: string
  kind: string
  recordId: string
  typeKey: string
  typeLabel: string
  title: string
  number: string | null
  label: string
  sublabel: string | null
  href: string | null
  status: ParcelRecordSummary['status']
  closed: boolean
  openAs: OpenGroup | null
  dates: RecordDates
  scheduled: CivilDate | null
  activity: CivilDate | null
  files: RecordFile[]
  note: string | null
  carriedFrom?: { parcelId: string; displayId: string }
  linkId?: string
}

export interface RecordGroup {
  parcelId: string
  displayId: string
  label: string
  rows: RecordRow[]
}

export interface RecordTable {
  own: RecordRow[]
  ancestral: RecordGroup[]
}

type Summary = ParcelRecordSummary & {
  carriedFrom?: { parcelId: string; displayId: string }
  linkId?: string
}

const NO_DATES: RecordDates = { filed: null, issued: null, expires: null, closed: null }

function keyOf(kind: string, id: string): string {
  return `${kind}:${id}`
}

function latest(dates: RecordDates): CivilDate | null {
  const known = [dates.filed, dates.issued, dates.closed].filter((d): d is CivilDate => d !== null)
  return known.length === 0 ? null : (known.sort().at(-1) ?? null)
}

function isClosed(s: Summary, dates: RecordDates): boolean {
  if (s.closed !== undefined) return s.closed
  return s.kind === 'historical_record' || (s.kind === 'inspection' && dates.closed !== null)
}

function isOrphanFile(s: Summary): boolean {
  return s.kind === 'document'
}

function labelsOf(kind: string, title: string, number: string | null) {
  if (kind === 'inspection') return { label: title, sublabel: number }
  return { label: number ?? title, sublabel: number === null ? null : title }
}

function toRow(s: Summary): RecordRow {
  const dates = s.dates ?? NO_DATES
  const file = isOrphanFile(s)
  const title = file ? (s.number ?? s.title) : s.title
  const number = file ? s.title : s.number
  const row: RecordRow = {
    key: keyOf(s.kind, s.recordId),
    kind: s.kind,
    recordId: s.recordId,
    typeKey: s.type?.key ?? s.kind,
    typeLabel: s.type?.label ?? s.title,
    title,
    number,
    ...labelsOf(s.kind, title, number),
    href: s.href,
    status: s.status,
    closed: file ? false : isClosed(s, dates),
    openAs: s.openAs ?? null,
    dates,
    scheduled: s.scheduled ?? null,
    activity: latest(dates),
    files: [],
    note: s.note ?? null,
  }
  if (s.carriedFrom !== undefined) row.carriedFrom = s.carriedFrom
  if (s.linkId !== undefined) row.linkId = s.linkId
  return row
}

function toFile(s: Summary): RecordFile {
  return {
    id: s.recordId,
    title: s.title,
    kindLabel: s.number,
    href: s.href,
    visibility: s.status,
    added: s.dates?.filed ?? s.date,
  }
}

function newestFirst(a: RecordFile, b: RecordFile): number {
  return (b.added ?? '').localeCompare(a.added ?? '') || a.title.localeCompare(b.title)
}

function belongsToParcel(s: Summary, parcelId: string): boolean {
  return s.parcelFile === true || (s.owner?.kind === 'parcel' && s.owner.id === parcelId)
}

export function parcelFilesOf(
  records: readonly ParcelRecordSummary[],
  parcelId: string,
): RecordFile[] {
  return records
    .filter((s) => s.kind === 'document' && belongsToParcel(s, parcelId))
    .map(toFile)
    .sort(newestFirst)
}

export function buildRecordTable(history: ParcelHistory, parcelId: string): RecordTable {
  const all: Summary[] = [...history.own, ...history.ancestral.flatMap((g) => g.records)]
  const recordKeys = new Set(
    all.filter((s) => s.kind !== 'document').map((s) => keyOf(s.kind, s.recordId)),
  )
  const filesByOwner = new Map<string, RecordFile[]>()
  const nested = new Set<string>()
  for (const s of all) {
    if (s.kind !== 'document' || s.owner === undefined) continue
    const owner = keyOf(s.owner.kind, s.owner.id)
    if (!recordKeys.has(owner)) continue
    const list = filesByOwner.get(owner) ?? []
    list.push(toFile(s))
    filesByOwner.set(owner, list)
    nested.add(s.recordId)
  }
  const rowsOf = (list: Summary[]): RecordRow[] =>
    list
      .filter((s) => !belongsToParcel(s, parcelId))
      .filter((s) => s.kind !== 'document' || !nested.has(s.recordId))
      .map((s) => {
        const row = toRow(s)
        row.files = (filesByOwner.get(row.key) ?? []).sort(newestFirst)
        return row
      })
  return {
    own: rowsOf(history.own),
    ancestral: history.ancestral
      .map((g) => ({
        parcelId: g.parcelId,
        displayId: g.displayId,
        label: g.label,
        rows: rowsOf(g.records),
      }))
      .filter((g) => g.rows.length > 0),
  }
}
