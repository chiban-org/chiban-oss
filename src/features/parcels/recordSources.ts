import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import type { CivilDate } from '@/types/civilDate'

export type Viewer = { kind: 'public' } | { kind: 'actor'; actor: Actor }

export interface RecordDates {
  filed: CivilDate | null
  issued: CivilDate | null
  expires: CivilDate | null
  closed: CivilDate | null
}

export interface ParcelRecordSummary {
  kind: string
  recordId: string
  title: string
  number: string | null
  status: { label: string; chip: 'passed' | 'failed' | 'overdue' | 'neutral' }
  date: CivilDate | null
  href: string | null
  note?: string | null
  thumbnailHref?: string | null
  closed?: boolean
  parcelFile?: boolean
  dates?: RecordDates
  type?: { key: string; label: string }
  owner?: { kind: string; id: string }
}

export interface ParcelRecordSource {
  kind: string
  summarize(
    db: DbOrTx,
    recordIds: string[],
    viewer: Viewer,
    signal: AbortSignal,
  ): Promise<ParcelRecordSummary[]>
}

const registry = new Map<string, ParcelRecordSource>()

export function registerParcelRecordSource(source: ParcelRecordSource): void {
  registry.set(source.kind, source)
}

export function parcelRecordSources(): ParcelRecordSource[] {
  return [...registry.values()]
}
