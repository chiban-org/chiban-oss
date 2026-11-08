import { and, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { inspections } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import { inspectionName } from '@/features/inspections/inspectorFocus'
import { loadSiteInfo } from '@/features/inspections/siteInfo'
import { utcToLocal } from '@/features/inspections/zonedTime'
import { inspectionOpenGroup } from '@/features/parcels/openGroups'
import {
  type ParcelRecordSummary,
  registerParcelRecordSource,
  type Viewer,
} from '@/features/parcels/recordSources'
import { getTownSettings } from '@/features/town/settings'
import type { CivilDate } from '@/types/civilDate'

const FALLBACK_ZONE = 'America/New_York'

const LABEL = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  passed: 'Passed',
  failed: 'Failed',
  cancelled: 'Cancelled',
} as const

const CHIP = {
  requested: 'neutral',
  scheduled: 'neutral',
  passed: 'passed',
  failed: 'failed',
  cancelled: 'neutral',
} as const

export async function summarizeInspections(
  db: DbOrTx,
  ids: string[],
  viewer: Viewer,
  signal: AbortSignal,
): Promise<ParcelRecordSummary[]> {
  const full = viewer.kind === 'actor' && hasFullRecordAccess(viewer.actor)
  const rows = await db
    .select()
    .from(inspections)
    .where(
      and(
        inArray(inspections.id, ids),
        full ? undefined : inArray(inspections.status, ['scheduled', 'passed', 'failed']),
      ),
    )
  const town = await getTownSettings(db, signal)
  const zone = town.ok ? town.value.timeZone : FALLBACK_ZONE
  const out: ParcelRecordSummary[] = []
  for (const row of rows) {
    const site = await loadSiteInfo(db, row.applicationId, new Date(), signal)
    const decidedOn =
      row.resultRecordedAt === null ? null : utcToLocal(row.resultRecordedAt, zone).date
    const requestedOn = utcToLocal(row.requestedAt, zone).date
    out.push({
      kind: 'inspection',
      recordId: row.id,
      title: inspectionName(row),
      number: site?.applicationNumber ?? null,
      status: { label: LABEL[row.status], chip: CHIP[row.status] },
      date: (decidedOn ?? row.scheduledDate ?? requestedOn) as CivilDate,
      type: { key: 'inspection', label: 'Inspection' },
      closed: inspectionOpenGroup(row.status) === null,
      openAs: inspectionOpenGroup(row.status),
      scheduled: row.scheduledDate as CivilDate | null,
      dates: {
        filed: requestedOn,
        issued: null,
        expires: null,
        closed: decidedOn,
      },
      href: full ? `/staff/inspections/${row.id}` : null,
      note: full ? row.resultNotes : null,
    })
  }
  return out
}

export function registerInspectionRecordSource(): void {
  registerParcelRecordSource({ kind: 'inspection', summarize: summarizeInspections })
}

registerInspectionRecordSource()
