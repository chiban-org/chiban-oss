import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { RequestForm } from '@/components/inspections/RequestForm'
import { StatusChip } from '@/components/StatusChip'
import { INSPECTION_ERROR_COPY } from '@/features/inspections/errorCopy'
import { findReinspectionTarget } from '@/features/inspections/lookup'
import { loadPortalInspections } from '@/features/inspections/portalInspections'
import { inspectionTypeLabel } from '@/features/inspections/siteInfo'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'
import { requirePortalContext } from '@/server/requirePortal'
import { isUuid } from '@/utils/uuid'
import { portalCancelInspectionAction, portalRequestInspectionAction } from './actions'

export const metadata: Metadata = { title: 'Inspections' }

export const dynamic = 'force-dynamic'

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
  return (
    <main className="space-y-6">
      <h1>{`Inspections for ${view.number}`}</h1>
      <p>
        <Link
          href={`/portal/applications/${applicationId}`}
          className="tap-target inline-flex items-center"
        >
          Back to the application
        </Link>
      </p>
      {view.paused ? (
        <p role="status" className="rounded-md bg-highlight px-3 py-2">
          {INSPECTION_ERROR_COPY.permit_suspended}
        </p>
      ) : null}
      {!view.paused && !view.requestsEnabled ? (
        <p role="status">{`Online requests are turned off. Call the land use office: ${view.phoneHoursText}.`}</p>
      ) : null}
      {view.canRequest && reinspection === null && view.types.length === 0 ? (
        <p role="status">
          Every inspection on this permit is already requested, scheduled, or passed.
        </p>
      ) : null}
      {view.canRequest && (reinspection !== null || view.types.length > 0) ? (
        <section aria-label="Request an inspection" className="max-w-xl">
          <h2>Request an inspection</h2>
          <RequestForm
            applicationId={applicationId}
            types={reinspection === null ? view.types : [reinspection]}
            {...(reinspection === null ? {} : { reinspectionOf: reinspection.inspectionId })}
            dates={view.dates}
            action={portalRequestInspectionAction}
            channels={[{ value: 'portal', label: 'Online' }]}
            phoneHoursText={view.phoneHoursText}
            outsidePhoneHours={false}
          />
        </section>
      ) : null}
      <section aria-label="Your inspections">
        <h2>Your inspections</h2>
        {view.history.length === 0 ? <p>No inspections have been requested.</p> : null}
        <ul className="list-none space-y-3 p-0">
          {view.history.map((row) => (
            <li key={row.id} className="space-y-1 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">{`${inspectionTypeLabel(row.inspectionType)} inspection`}</span>
                <StatusChip status={CHIP[row.status]} label={LABEL[row.status]} />
              </div>
              {row.scheduledDate !== null && row.startMinute !== null ? (
                <p>{`${formatCivilDate(row.scheduledDate)} at ${minutesToClock(row.startMinute)}`}</p>
              ) : null}
              {row.resultNotes === null ? null : <p>{`Notes: ${row.resultNotes}`}</p>}
              {row.status === 'failed' &&
              view.canRequest &&
              view.reinspectableIds.includes(row.id) ? (
                <Link
                  href={`/portal/applications/${applicationId}/inspections?reinspect=${row.id}`}
                  className="tap-target inline-flex items-center"
                >
                  Request a reinspection
                </Link>
              ) : null}
              {row.channel === 'portal' &&
              row.requestedByUserId === ctx.actor.userId &&
              (row.status === 'requested' || row.status === 'scheduled') ? (
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
          ))}
        </ul>
      </section>
    </main>
  )
}
