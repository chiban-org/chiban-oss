import { and, inArray, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, certificatesOfOccupancy } from '@/db/schema'
import {
  type ApplicationTypeBody,
  boardKindOf,
} from '@/features/applications/applicationTypeSchema'
import { expiryDates } from '@/features/applications/expiryDates'
import { stateLabel } from '@/features/applications/stateLabel'
import type { CoreState } from '@/features/applications/states'
import { getVersion } from '@/features/config/store'
import { type LatestDecision, latestDecisions } from '@/features/parcels/boardOutcomes'
import {
  APPROVING_OUTCOMES,
  applicationOpenGroup,
  decisionOutcome,
} from '@/features/parcels/openGroups'
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

const NOTICE_NOT_FILED: ParcelRecordSummary['status'] = {
  label: 'Decided, notice not yet filed',
  chip: 'neutral',
}

function statusOf(
  row: { state: CoreState; closureReason: string | null },
  certificateIssuedOn: string | undefined,
  decision: { latest: LatestDecision | undefined; publicView: boolean },
): ParcelRecordSummary['status'] {
  const { latest, publicView } = decision
  if (row.state === 'decided' && latest !== undefined) {
    if (publicView && latest.filedOn === null) return NOTICE_NOT_FILED
    return decisionOutcome(latest.outcome, latest.boardKind)
  }
  return {
    label: statusLabel(row.state, certificateIssuedOn, row.closureReason),
    chip: CHIPS[row.state],
  }
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
  const expiries = await expiryDates(
    db,
    rows.map((r) => r.id),
  )
  const decisions = await latestDecisions(
    db,
    rows.map((r) => r.id),
  )
  const out: ParcelRecordSummary[] = []
  for (const row of rows) {
    const pins = row.configPins as { applicationType: string }
    const type = await getVersion(db, pins.applicationType, signal)
    const state = row.state as CoreState
    const body = type?.body as ApplicationTypeBody | undefined
    const title = body?.label ?? row.applicationTypeKey
    const decision = decisions.get(row.id)
    const openAs = applicationOpenGroup({
      state,
      board: boardKindOf(body?.classification) !== null || decision !== undefined,
      approved: decision !== undefined && APPROVING_OUTCOMES.includes(decision.outcome),
    })
    out.push({
      kind: 'application',
      recordId: row.id,
      title,
      type: { key: row.applicationTypeKey, label: title },
      number: row.number,
      status: statusOf(
        { state, closureReason: row.closureReason },
        certificates.find((c) => c.applicationId === row.id)?.issuedOn,
        { latest: decision, publicView: viewer.kind === 'public' },
      ),
      closed: openAs === null,
      openAs,
      date: (row.issuedOn ?? row.receivedDate) as CivilDate | null,
      dates: {
        filed: row.receivedDate as CivilDate | null,
        issued: row.issuedOn as CivilDate | null,
        expires: expiries.get(row.id) ?? null,
        closed: row.decidedOn as CivilDate | null,
      },
      href: full ? `/staff/applications/${row.id}` : null,
    })
  }
  return out
}

export function registerApplicationRecordSource(): void {
  registerParcelRecordSource({ kind: 'application', summarize: summarizeApplications })
}

registerApplicationRecordSource()
