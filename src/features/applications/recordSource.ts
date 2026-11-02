import { and, inArray, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { type CoreState, STATE_LABELS } from '@/features/applications/states'
import { getVersion } from '@/features/config/store'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import {
  type ParcelRecordSummary,
  registerParcelRecordSource,
  type Viewer,
} from '@/features/parcels/recordSources'
import { hasFullRecordAccess } from '@/features/projects/access'
import type { CivilDate } from '@/types/civilDate'

type Chip = ParcelRecordSummary['status']['chip']

const CHIPS: Record<CoreState, Chip> = {
  draft: 'neutral',
  submitted: 'neutral',
  under_review: 'neutral',
  decided: 'neutral',
  issued: 'passed',
  closed: 'neutral',
  denied: 'failed',
  withdrawn: 'neutral',
  expired: 'failed',
  suspended: 'overdue',
}

function stateLabel(state: CoreState): string {
  return state === 'suspended'
    ? ruleByKey(loadPack(), 'nh.appeal.suspension').label
    : STATE_LABELS[state]
}

function seesFullRecord(viewer: Viewer): boolean {
  return viewer.kind === 'actor' && hasFullRecordAccess(viewer.actor)
}

export async function summarizeApplications(
  db: DbOrTx,
  ids: string[],
  viewer: Viewer,
  signal: AbortSignal,
): Promise<ParcelRecordSummary[]> {
  const full = seesFullRecord(viewer)
  const rows = await db
    .select()
    .from(applications)
    .where(and(inArray(applications.id, ids), full ? undefined : ne(applications.state, 'draft')))
  const out: ParcelRecordSummary[] = []
  for (const row of rows) {
    const pins = row.configPins as { applicationType: string }
    const type = await getVersion(db, pins.applicationType, signal)
    const state = row.state as CoreState
    out.push({
      kind: 'application',
      recordId: row.id,
      title: (type?.body as ApplicationTypeBody | undefined)?.label ?? row.applicationTypeKey,
      number: row.number,
      status: { label: stateLabel(state), chip: CHIPS[state] },
      date: (row.issuedOn ?? row.receivedDate) as CivilDate | null,
      href: full ? `/staff/applications/${row.id}` : null,
    })
  }
  return out
}

export function registerApplicationRecordSource(): void {
  registerParcelRecordSource({ kind: 'application', summarize: summarizeApplications })
}

registerApplicationRecordSource()
