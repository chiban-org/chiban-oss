import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { TextField } from '@/components/staff/fields'
import { loadApplicationContext } from '@/features/applications/context'
import { hasCapability } from '@/features/authz/capabilities'
import type { InspectionHistoryRow } from '@/features/inspections/history'
import { listInspectionHistory } from '@/features/inspections/history'
import { reinspectableFailureIds } from '@/features/inspections/lookup'
import { inspectionTypeLabel } from '@/features/inspections/siteInfo'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import type { StaffContext } from '@/server/requireStaff'
import { cancelInspectionAction, issueCertificateAction } from '../../inspections/actions'

const CHIP = {
  requested: 'neutral',
  scheduled: 'neutral',
  passed: 'passed',
  failed: 'failed',
  cancelled: 'neutral',
} as const

const LABEL = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  passed: 'Passed',
  failed: 'Failed',
  cancelled: 'Cancelled',
} as const

export interface InspectionsPanelData {
  history: InspectionHistoryRow[]
  canSchedule: boolean
  certificateReady: boolean
  rowVersion: number
  today: string
  reinspectableIds: string[]
}

export async function loadInspectionsPanelData(
  ctx: StaffContext,
  applicationId: string,
): Promise<InspectionsPanelData> {
  const history = await listInspectionHistory(ctx.db, ctx.actor, applicationId, ctx.signal)
  const app = await loadApplicationContext(ctx.db, applicationId, ctx.signal)
  const canSchedule = await hasCapability(
    ctx.db,
    ctx.actor.userId,
    'inspection.schedule',
    ctx.signal,
  )
  const canIssue = await hasCapability(ctx.db, ctx.actor.userId, 'permit.issue', ctx.signal)
  const latestFinal = history
    .filter((h) => h.isFinal && (h.status === 'passed' || h.status === 'failed'))
    .sort((a, b) => (a.resultRecordedAt?.getTime() ?? 0) - (b.resultRecordedAt?.getTime() ?? 0))
    .at(-1)
  return {
    history,
    canSchedule,
    certificateReady:
      canIssue &&
      app?.state === 'issued' &&
      app.typeBody.workflow.closesOn === 'certificate_of_occupancy' &&
      latestFinal?.status === 'passed',
    rowVersion: app?.rowVersion ?? 1,
    today: await townToday(ctx.db, new Date(), ctx.signal),
    reinspectableIds: [...(await reinspectableFailureIds(ctx.db, applicationId))],
  }
}

export function InspectionsPanel({
  data,
  applicationId,
  number,
}: {
  data: InspectionsPanelData
  applicationId: string
  number: string
}) {
  const { history, canSchedule, certificateReady, rowVersion, today, reinspectableIds } = data
  return (
    <section aria-label="Inspections">
      <h2>Inspections</h2>
      {history.length === 0 ? <p>No inspections have been requested.</p> : null}
      <ul className="m-0 list-none space-y-3 p-0">
        {history.map((row) => (
          <li key={row.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/staff/inspections/${row.id}`} className="text-action underline">
                {`${inspectionTypeLabel(row.inspectionType)} inspection`}
              </Link>
              <StatusChip status={CHIP[row.status]} label={LABEL[row.status]} />
              {row.reinspectionOf === null ? null : <span>Reinspection</span>}
            </div>
            {row.scheduledDate !== null && row.startMinute !== null ? (
              <p className="m-0">{`${formatCivilDate(row.scheduledDate)} at ${minutesToClock(row.startMinute)}`}</p>
            ) : null}
            {row.resultNotes === null ? null : <p className="m-0">{`Notes: ${row.resultNotes}`}</p>}
            {row.photoCount === 0 ? null : (
              <p className="m-0">{`${row.photoCount} ${row.photoCount === 1 ? 'photo' : 'photos'}`}</p>
            )}
            {canSchedule && row.status === 'failed' && reinspectableIds.includes(row.id) ? (
              <Link
                href={`/staff/inspections?number=${encodeURIComponent(number)}&reinspect=${row.id}`}
                className="text-action underline"
              >
                Request a reinspection
              </Link>
            ) : null}
            {canSchedule && (row.status === 'requested' || row.status === 'scheduled') ? (
              <ActionForm action={cancelInspectionAction} submitLabel="Cancel this inspection">
                <input type="hidden" name="inspectionId" value={row.id} />
                <input type="hidden" name="expectedRowVersion" value={row.rowVersion} />
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ul>
      {canSchedule ? (
        <p>
          <Link
            href={`/staff/inspections?number=${encodeURIComponent(number)}`}
            className="text-action underline"
          >
            Take an inspection request for this permit
          </Link>
        </p>
      ) : null}
      {certificateReady ? (
        <ActionForm
          action={issueCertificateAction}
          submitLabel="Issue the certificate of occupancy"
        >
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="expectedRowVersion" value={rowVersion} />
          <TextField label="Issue date" name="issuedOn" type="date" defaultValue={today} required />
        </ActionForm>
      ) : null}
    </section>
  )
}
