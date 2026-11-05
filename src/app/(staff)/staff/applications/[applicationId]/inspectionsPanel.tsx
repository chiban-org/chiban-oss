import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { TextField } from '@/components/staff/fields'
import { loadApplicationContext } from '@/features/applications/context'
import { hasCapability } from '@/features/authz/capabilities'
import type { InspectionHistoryRow } from '@/features/inspections/history'
import { listInspectionHistory } from '@/features/inspections/history'
import { describeIntakeBlock, reinspectableFailureIds } from '@/features/inspections/lookup'
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
  takesRequests: boolean
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
    takesRequests:
      app !== null &&
      app.pins.checklists.length > 0 &&
      (await describeIntakeBlock(ctx.db, app, ctx.signal)) === null,
  }
}

function whenText(row: InspectionHistoryRow): string | null {
  if (row.scheduledDate === null || row.startMinute === null) return null
  return `${formatCivilDate(row.scheduledDate)} at ${minutesToClock(row.startMinute)}`
}

function resultText(row: InspectionHistoryRow): string {
  const photos =
    row.photoCount === 0 ? '' : `${row.photoCount} ${row.photoCount === 1 ? 'photo' : 'photos'}`
  return [row.resultNotes ?? '', photos].filter((part) => part !== '').join(' ')
}

function RowActions({
  row,
  data,
  number,
}: {
  row: InspectionHistoryRow
  data: InspectionsPanelData
  number: string
}) {
  if (!data.canSchedule) return null
  const reinspect =
    data.takesRequests && row.status === 'failed' && data.reinspectableIds.includes(row.id)
  const open = row.status === 'requested' || row.status === 'scheduled'
  if (!reinspect && !open) return null
  return (
    <div className="flex flex-wrap items-start gap-x-4 text-sm">
      {reinspect ? (
        <Link href={`/staff/inspections?number=${encodeURIComponent(number)}&reinspect=${row.id}`}>
          Request a reinspection
        </Link>
      ) : null}
      {open ? (
        <details>
          <summary className="text-sm font-normal text-status-failed-fg">Cancel</summary>
          <ActionForm
            action={cancelInspectionAction}
            submitLabel="Cancel this inspection"
            confirm={{
              title: 'Cancel this inspection?',
              body: 'The inspection is cancelled. Request a new one if it is still needed.',
              confirmLabel: 'Cancel the inspection',
              cancelLabel: 'Keep the inspection',
            }}
            variant="destructive"
            compact
          >
            <input type="hidden" name="inspectionId" value={row.id} />
            <input type="hidden" name="expectedRowVersion" value={row.rowVersion} />
          </ActionForm>
        </details>
      ) : null}
    </div>
  )
}

function InspectionRow({
  row,
  data,
  number,
}: {
  row: InspectionHistoryRow
  data: InspectionsPanelData
  number: string
}) {
  const when = whenText(row)
  const result = resultText(row)
  return (
    <li className="record-item flex flex-col gap-1 pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={`/staff/inspections/${row.id}`} className="font-medium">
          {`${inspectionTypeLabel(row.inspectionType)} inspection`}
        </Link>
        <StatusChip status={CHIP[row.status]} label={LABEL[row.status]} />
        {row.reinspectionOf === null ? null : <span className="text-sm">Reinspection</span>}
        {when === null ? null : <span className="text-sm text-muted-foreground">{when}</span>}
      </div>
      {result === '' ? null : <p className="m-0 text-sm text-ink-secondary">{result}</p>}
      <RowActions row={row} data={data} number={number} />
    </li>
  )
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
  const { history, canSchedule, certificateReady, rowVersion, today } = data
  return (
    <section aria-label="Inspections" id="inspections">
      <h2>Inspections</h2>
      {history.length === 0 ? <p>No inspections have been requested.</p> : null}
      <ul className="list-none p-0">
        {history.map((row) => (
          <InspectionRow key={row.id} row={row} data={data} number={number} />
        ))}
      </ul>
      {canSchedule && data.takesRequests ? (
        <p>
          <Link href={`/staff/inspections?number=${encodeURIComponent(number)}`}>
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
