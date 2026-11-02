import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { RequestForm } from '@/components/inspections/RequestForm'
import { StatusChip } from '@/components/StatusChip'
import { loadPortalInspections } from '@/features/inspections/portalInspections'
import { inspectionTypeLabel } from '@/features/inspections/siteInfo'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'
import { requirePortalContext } from '@/server/requirePortal'
import { isUuid } from '@/utils/uuid'
import { portalCancelInspectionAction, portalRequestInspectionAction } from './actions'

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
}: {
  params: Promise<{ applicationId: string }>
}) {
  const { applicationId } = await params
  const ctx = await requirePortalContext(`/portal/applications/${applicationId}/inspections`)
  if (!isUuid(applicationId)) notFound()
  const loaded = await loadPortalInspections(ctx.db, ctx.actor, applicationId, ctx.signal)
  if (!loaded.ok) notFound()
  const view = loaded.value
  return (
    <main className="space-y-6">
      <h1>{`Inspections for ${view.number}`}</h1>
      <p>
        <Link
          href={`/portal/applications/${applicationId}`}
          className="tap-target inline-flex items-center underline"
        >
          Back to the application
        </Link>
      </p>
      {view.paused ? (
        <p role="status" className="rounded-md bg-highlight px-3 py-2">
          Inspections are paused while this permit is under appeal.
        </p>
      ) : null}
      {!view.paused && !view.requestsEnabled ? (
        <p role="status">{`Online requests are turned off. Call the land use office: ${view.phoneHoursText}.`}</p>
      ) : null}
      {view.canRequest ? (
        <section aria-label="Request an inspection" className="max-w-xl space-y-3">
          <h2>Request an inspection</h2>
          <RequestForm
            applicationId={applicationId}
            types={view.types}
            dates={view.dates}
            action={portalRequestInspectionAction}
            channels={[{ value: 'portal', label: 'Online' }]}
            phoneHoursText={view.phoneHoursText}
            outsidePhoneHours={false}
          />
        </section>
      ) : null}
      <section aria-label="Your inspections" className="space-y-3">
        <h2>Your inspections</h2>
        {view.history.length === 0 ? <p>No inspections have been requested.</p> : null}
        <ul className="m-0 list-none space-y-3 p-0">
          {view.history.map((row) => (
            <li key={row.id} className="space-y-1 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">{`${inspectionTypeLabel(row.inspectionType)} inspection`}</span>
                <StatusChip status={CHIP[row.status]} label={LABEL[row.status]} />
              </div>
              {row.scheduledDate !== null && row.startMinute !== null ? (
                <p className="m-0">{`${formatCivilDate(row.scheduledDate)} at ${minutesToClock(row.startMinute)}`}</p>
              ) : null}
              {row.resultNotes === null ? null : (
                <p className="m-0">{`Notes: ${row.resultNotes}`}</p>
              )}
              {row.channel === 'portal' &&
              row.requestedByUserId === ctx.actor.userId &&
              (row.status === 'requested' || row.status === 'scheduled') ? (
                <ActionForm action={portalCancelInspectionAction} submitLabel="Cancel this request">
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
