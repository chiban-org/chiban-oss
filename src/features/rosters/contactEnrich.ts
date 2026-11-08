import type { DbOrTx } from '@/db/client'
import { displayIdsFor } from '@/features/parcels/displayId'
import type { EntryKind } from '@/features/rosters/confirm'
import type { Enrichment, EntryRecord } from '@/features/rosters/contactShape'
import { endingsUsed } from '@/features/rosters/restrictionEnd'
import { rosterEndingsUsed } from '@/features/rosters/rosterEnd'
import { listsUsing } from '@/features/rosters/usedBy'
import { type EarlierVersion, earlierVersions, historyByEntry } from '@/features/rosters/versions'
import type { CivilDate } from '@/types/civilDate'

export interface EnrichInput {
  kind: EntryKind
  today: CivilDate
  recheckDays: number
  timeZone: string
}

interface EnrichRows {
  shown: readonly EntryRecord[]
  siblings: readonly EntryRecord[]
}

async function versionsFor(
  db: DbOrTx,
  kind: EntryKind,
  { shown, siblings }: EnrichRows,
  timeZone: string,
): Promise<ReadonlyMap<string, EarlierVersion[]>> {
  const parcelIds = [...new Set(shown.map((r) => r.parcelId))]
  const history = await earlierVersions(db, { kind, parcelIds, timeZone })
  if (kind === 'restriction') return history
  const onParcels = new Set(parcelIds)
  return historyByEntry(
    siblings.filter((s) => onParcels.has(s.parcelId)),
    history,
  )
}

async function usedEndingsFor(
  db: DbOrTx,
  kind: EntryKind,
  rows: readonly EntryRecord[],
): Promise<ReadonlySet<string>> {
  const ended = rows.filter((r) => r.endedOn !== null).map((r) => r.id)
  if (kind === 'restriction') return await endingsUsed(db, ended)
  return await rosterEndingsUsed(db, { kind, entryIds: ended })
}

export async function enrichmentFor(
  db: DbOrTx,
  rows: EnrichRows,
  input: EnrichInput,
  signal: AbortSignal,
): Promise<Enrichment> {
  const { kind } = input
  const { shown } = rows
  return {
    today: input.today,
    recheckDays: input.recheckDays,
    labels: await displayIdsFor(
      db,
      shown.map((r) => r.parcelId),
    ),
    uses: await listsUsing(
      db,
      shown.map((r) => r.id),
      signal,
    ),
    versions: await versionsFor(db, kind, rows, input.timeZone),
    usedEndings: await usedEndingsFor(db, kind, shown),
  }
}
