import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChecklistForm } from '@/components/inspections/ChecklistForm'
import { InspectionPhotoUploader } from '@/components/inspections/InspectionPhotos'
import { PageHeader } from '@/components/layout/PageHeader'
import { NEW_TAB } from '@/components/newTab'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { recordExists } from '@/features/access/recordExists'
import { honestText } from '@/features/honest/honest'
import { loadInspectionView } from '@/features/inspections/inspectionView'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { recordResultAction } from './actions'
import { inspectionFacts } from './inspectionFacts'

export const metadata: Metadata = { title: 'Inspection' }

export const dynamic = 'force-dynamic'

const STATUS = {
  requested: { chip: 'neutral', label: 'Requested' },
  scheduled: { chip: 'neutral', label: 'Scheduled' },
  passed: { chip: 'passed', label: 'Passed' },
  failed: { chip: 'failed', label: 'Failed' },
  cancelled: { chip: 'neutral', label: 'Cancelled' },
} as const

const LISTED_STATUSES: readonly string[] = ['scheduled', 'passed', 'failed']
const OUTCOME = { pass: 'Pass', fail: 'Fail', na: 'N/A' } as const
const LINK = 'inline-flex min-h-11 items-center'

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ inspectionId: string }>
}) {
  const { inspectionId } = await params
  const ctx = await requireStaffContext()
  if (!isUuid(inspectionId)) notFound()
  const loaded = await loadInspectionView(ctx.db, ctx.actor, inspectionId, ctx.signal)
  if (!loaded.ok) {
    if (await recordExists(ctx.db, 'inspection', inspectionId, ctx.signal)) {
      return <NoPermission title="Inspection" action="see this inspection" />
    }
    notFound()
  }
  const view = loaded.value
  const { inspection } = view
  const status = STATUS[inspection.status]
  const address = honestText(view.siteAddress, 'Address not on file')
  return (
    <main className="public-shell mx-auto max-w-xl space-y-5">
      <PageHeader
        kicker={
          <Link href={`/staff/applications/${inspection.applicationId}`} className={LINK}>
            {view.applicationNumber}
          </Link>
        }
        title={`${view.typeLabel} inspection`}
        status={<StatusChip status={status.chip} label={status.label} />}
        lead={address}
        facts={inspectionFacts(view, LINK)}
      />
      {LISTED_STATUSES.includes(inspection.status) ? (
        <p className="text-muted-foreground">
          The public parcel page lists this inspection with its number, type, status and dates.
        </p>
      ) : null}
      {view.previousFailureNotes === null ? null : (
        <p className="rounded-md bg-highlight px-3 py-2">{`Last time: ${view.previousFailureNotes}`}</p>
      )}
      {view.waitingForDate ? (
        <p role="status">This inspection can be recorded on or after its scheduled date.</p>
      ) : null}
      {view.canRecord ? (
        <section aria-label="Checklist">
          <h2 className="text-xl">Checklist</h2>
          <ChecklistForm
            inspectionId={inspection.id}
            rowVersion={inspection.rowVersion}
            items={view.items}
            action={recordResultAction}
            initialNotes=""
          />
        </section>
      ) : (
        <section aria-label="Result">
          <h2 className="text-xl">Checklist</h2>
          <ul className="list-none space-y-1 p-0">
            {view.items.map((item) => (
              <li key={item.key}>
                {`${item.label}: ${item.outcome === null ? 'Not answered' : OUTCOME[item.outcome]}`}
              </li>
            ))}
          </ul>
          {inspection.resultNotes === null ? null : <p>{`Notes: ${inspection.resultNotes}`}</p>}
        </section>
      )}
      <section aria-label="Photos">
        <h2 className="text-xl">Photos</h2>
        {view.photos.length === 0 ? (
          <p>No photos yet.</p>
        ) : (
          <ul className="list-none space-y-1 p-0">
            {view.photos.map((photo) => (
              <li key={photo.documentId}>
                <a {...NEW_TAB} className={LINK} href={`/api/documents/${photo.documentId}`}>
                  {photo.title}
                </a>
              </li>
            ))}
          </ul>
        )}
        {view.canAddPhotos ? <InspectionPhotoUploader inspectionId={inspection.id} /> : null}
      </section>
    </main>
  )
}
