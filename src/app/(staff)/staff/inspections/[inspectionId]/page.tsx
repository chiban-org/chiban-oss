import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChecklistForm } from '@/components/inspections/ChecklistForm'
import { InspectionPhotoUploader } from '@/components/inspections/InspectionPhotos'
import { StatusChip } from '@/components/StatusChip'
import { honestText } from '@/features/honest/honest'
import { loadInspectionView } from '@/features/inspections/inspectionView'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { recordResultAction } from './actions'

export const dynamic = 'force-dynamic'

const STATUS = {
  requested: { chip: 'neutral', label: 'Requested' },
  scheduled: { chip: 'neutral', label: 'Scheduled' },
  passed: { chip: 'passed', label: 'Passed' },
  failed: { chip: 'failed', label: 'Failed' },
  cancelled: { chip: 'neutral', label: 'Cancelled' },
} as const

const OUTCOME = { pass: 'Pass', fail: 'Fail', na: 'N/A' } as const
const LINK = 'inline-flex min-h-11 items-center text-action underline'

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ inspectionId: string }>
}) {
  const { inspectionId } = await params
  const ctx = await requireStaffContext()
  if (!isUuid(inspectionId)) notFound()
  const loaded = await loadInspectionView(ctx.db, ctx.actor, inspectionId, ctx.signal)
  if (!loaded.ok) notFound()
  const view = loaded.value
  const { inspection } = view
  const status = STATUS[inspection.status]
  const address = honestText(view.siteAddress, 'Address not on file')
  return (
    <main className="public-shell mx-auto max-w-xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0 text-2xl">{`${view.typeLabel} inspection`}</h1>
        <StatusChip status={status.chip} label={status.label} />
      </div>
      <p className="m-0 font-medium">
        <Link href={`/staff/applications/${inspection.applicationId}`} className={LINK}>
          {view.applicationNumber}
        </Link>
      </p>
      <p className="m-0">{address}</p>
      {inspection.scheduledDate !== null && inspection.startMinute !== null ? (
        <p className="m-0">{`${formatCivilDate(inspection.scheduledDate)} at ${minutesToClock(inspection.startMinute)}`}</p>
      ) : null}
      <p className="m-0">{inspection.contactName}</p>
      {inspection.contactPhone === null ? null : (
        <a className={LINK} href={`tel:${inspection.contactPhone.replace(/[^\d+]/g, '')}`}>
          {inspection.contactPhone}
        </a>
      )}
      {inspection.accessNotes === null ? null : (
        <p className="m-0">{`Access: ${inspection.accessNotes}`}</p>
      )}
      {view.previousFailureNotes === null ? null : (
        <p className="m-0 rounded-md bg-highlight px-3 py-2">{`Last time: ${view.previousFailureNotes}`}</p>
      )}
      {view.waitingForDate ? (
        <p role="status">This inspection can be recorded on or after its scheduled date.</p>
      ) : null}
      {view.canRecord ? (
        <section aria-label="Checklist" className="space-y-3">
          <h2 className="m-0 text-xl">Checklist</h2>
          <ChecklistForm
            inspectionId={inspection.id}
            rowVersion={inspection.rowVersion}
            items={view.items}
            action={recordResultAction}
            initialNotes=""
          />
        </section>
      ) : (
        <section aria-label="Result" className="space-y-2">
          <h2 className="m-0 text-xl">Checklist</h2>
          <ul className="m-0 list-none space-y-1 p-0">
            {view.items.map((item) => (
              <li key={item.key}>
                {`${item.label}: ${item.outcome === null ? 'Not answered' : OUTCOME[item.outcome]}`}
              </li>
            ))}
          </ul>
          {inspection.resultNotes === null ? null : <p>{`Notes: ${inspection.resultNotes}`}</p>}
        </section>
      )}
      <section aria-label="Photos" className="space-y-3">
        <h2 className="m-0 text-xl">Photos</h2>
        {view.photos.length === 0 ? (
          <p className="m-0">No photos yet.</p>
        ) : (
          <ul className="m-0 list-none space-y-1 p-0">
            {view.photos.map((photo) => (
              <li key={photo.documentId}>
                <a className={LINK} href={`/api/documents/${photo.documentId}`}>
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
