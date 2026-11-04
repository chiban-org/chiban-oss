import { and, inArray, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, certificatesOfOccupancy } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { stateLabel } from '@/features/applications/stateLabel'
import type { CoreState } from '@/features/applications/states'
import { getVersion } from '@/features/config/store'
import {
  type ParcelRecordSummary,
  registerParcelRecordSource,
  type Viewer,
} from '@/features/parcels/recordSources'
import { hasFullRecordAccess } from '@/features/projects/access'
import { formatCivilDate } from '@/lib/formatDate'
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

const CLOSED_STATES: readonly CoreState[] = ['issued', 'expired', 'closed', 'denied', 'withdrawn']

export const NOT_ACCEPTED_REASON = 'not_accepted_incomplete'

function statusLabel(
  state: CoreState,
  certificateIssuedOn: string | undefined,
  closureReason: string | null,
): string {
  if (state === 'denied' && closureReason === NOT_ACCEPTED_REASON) return 'Not accepted as complete'
  return state === 'closed' && certificateIssuedOn !== undefined
    ? `Certificate of occupancy issued ${formatCivilDate(certificateIssuedOn)}`
    : stateLabel(state)
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
  const certificates = await db
    .select({
      applicationId: certificatesOfOccupancy.applicationId,
      issuedOn: certificatesOfOccupancy.issuedOn,
    })
    .from(certificatesOfOccupancy)
    .where(inArray(certificatesOfOccupancy.applicationId, ids))
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
      status: {
        label: statusLabel(
          state,
          certificates.find((c) => c.applicationId === row.id)?.issuedOn,
          row.closureReason,
        ),
        chip: CHIPS[state],
      },
      closed: CLOSED_STATES.includes(state),
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
