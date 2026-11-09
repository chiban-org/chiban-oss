import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusChip } from '@/components/StatusChip'
import { INSPECTION_ERROR_COPY } from '@/features/inspections/errorCopy'
import type { InspectionHistoryRow } from '@/features/inspections/history'
import { findReinspectionTarget } from '@/features/inspections/lookup'
import {
  loadPortalInspections,
  type PortalInspectionsView,
} from '@/features/inspections/portalInspections'
import { inspectionTypeLabel } from '@/features/inspections/siteInfo'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { contactDefaults } from '@/features/portal/contactDefaults'
import { portalInspectionLabel } from '@/features/portal/inspectionLabel'
import { formatWeekdayMonthDay } from '@/lib/formatDate'
import { requirePortalContext } from '@/server/requirePortal'
import { isUuid } from '@/utils/uuid'
import { portalCancelInspectionAction } from './actions'
import { RequestPanel } from './RequestPanel'

export const metadata: Metadata = { title: 'Inspections' }

export const dynamic = 'force-dynamic'

const LINK = 'tap-target inline-flex items-center'

function HistoryItem(props: {
  row: InspectionHistoryRow
  view: PortalInspectionsView
  applicationId: string
  userId: string
}) {
  const { row, view, applicationId } = props
  const { chip, label } = portalInspectionLabel(row, view.today)
  const reinspect =
    row.status === 'failed' && view.canRequest && view.reinspectableIds.includes(row.id)
  const cancellable =
    row.channel === 'portal' &&
    row.requestedByUserId === props.userId &&
    (row.status === 'requested' || row.status === 'scheduled')
  return (
    <li className="space-y-1 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">{`${inspectionTypeLabel(row.inspectionType)} inspection`}</span>
        <StatusChip status={chip} label={label} />
      </div>
      {row.scheduledDate !== null && row.startMinute !== null ? (
        <p>{`${formatWeekdayMonthDay(row.scheduledDate)} at ${minutesToClock(row.startMinute)}`}</p>
      ) : null}
      {row.resultNotes === null ? null : <p>{`Notes: ${row.resultNotes}`}</p>}
      {reinspect ? (
        <Link
          href={`/portal/applications/${applicationId}/inspections?reinspect=${row.id}`}
          className={LINK}
        >
          Request a reinspection
        </Link>
      ) : null}
      {cancellable ? (
        <ActionForm
          action={portalCancelInspectionAction}
          submitLabel="Cancel this request"
          confirm={{
            title: 'Cancel this inspection request?',
            body: 'The inspection is cancelled. You can request a new one from this page.',
            confirmLabel: 'Cancel the request',
            cancelLabel: 'Keep the request',
          }}
        >
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="inspectionId" value={row.id} />
          <input type="hidden" name="expectedRowVersion" value={row.rowVersion} />
        </ActionForm>
      ) : null}
    </li>
  )
}

function Notices({ view, offered }: { view: PortalInspectionsView; offered: boolean }) {
  if (view.paused) {
    return (
      <p role="status" className="rounded-md border border-hairline px-3 py-2">
        {INSPECTION_ERROR_COPY.permit_suspended}
      </p>
    )
  }
  if (!view.requestsEnabled) {
    return (
      <p role="status">{`Online requests are turned off. Call the land use office: ${view.phoneHoursText}.`}</p>
    )
  }
  if (view.canRequest && !offered) {
    return (
      <p role="status">
        Every inspection on this permit is already requested, scheduled, or passed.
      </p>
    )
  }
  return null
}

export default async function PortalInspectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>
  searchParams: Promise<{ reinspect?: string }>
}) {
  const { applicationId } = await params
  const { reinspect = '' } = await searchParams
  const ctx = await requirePortalContext(`/portal/applications/${applicationId}/inspections`)
  if (!isUuid(applicationId)) notFound()
  const loaded = await loadPortalInspections(ctx.db, ctx.actor, applicationId, ctx.signal)
  if (!loaded.ok) notFound()
  const view = loaded.value
  const reinspection = view.canRequest
    ? await findReinspectionTarget(ctx.db, ctx.actor, applicationId, reinspect, ctx.signal)
    : null
  const offered = reinspection !== null || view.types.length > 0
  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        kicker={
          <Link href={`/portal/applications/${applicationId}`} className={LINK}>
            Back to the application
          </Link>
        }
        title={`Inspections for ${view.number}`}
      />
      <Notices view={view} offered={offered} />
      <section aria-label="Your inspections">
        <h2>Your inspections</h2>
        {view.history.length === 0 ? <p>No inspections have been requested.</p> : null}
        <ul className="list-none space-y-3 p-0">
          {view.history.map((row) => (
            <HistoryItem
              key={row.id}
              row={row}
              view={view}
              applicationId={applicationId}
              userId={ctx.actor.userId}
            />
          ))}
        </ul>
      </section>
      {view.canRequest && offered ? (
        <section aria-label="Request an inspection">
          <RequestPanel
            applicationId={applicationId}
            types={reinspection === null ? view.types : [reinspection]}
            reinspectionOf={reinspection?.inspectionId ?? null}
            dates={view.dates}
            phoneHoursText={view.phoneHoursText}
            contact={await contactDefaults(ctx.db, ctx.actor.userId, ctx.signal)}
            startOpen={view.history.length === 0 || reinspection !== null}
          />
        </section>
      ) : null}
    </main>
  )
}
