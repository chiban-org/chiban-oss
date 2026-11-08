import Link from 'next/link'
import { ChecklistForm } from '@/components/inspections/ChecklistForm'
import { InspectionPhotoUploader } from '@/components/inspections/InspectionPhotos'
import { FactList } from '@/components/layout/PageHeader'
import { DoThisNowCard } from '@/components/layout/WorkPlan'
import { NEW_TAB } from '@/components/newTab'
import { Button } from '@/components/ui/button'
import type { InspectionRecord } from '@/features/inspections/inspectionRecord'
import { recordResultAction } from './actions'
import { cancelFactList } from './inspectionFacts'

const OUTCOME = { pass: 'Pass', fail: 'Fail', na: 'N/A' } as const

function LastTime({ record }: { record: InspectionRecord }) {
  const notes = record.view.previousFailureNotes
  if (notes === null || record.view.inspection.status !== 'scheduled') return null
  return (
    <p>
      <span className="attention font-semibold">Last time:</span> {notes}
    </p>
  )
}

function CardAction({ record }: { record: InspectionRecord }) {
  const { view, plan } = record
  const { inspection } = view
  switch (plan.now.kind) {
    case 'schedule':
      return (
        <Button asChild className="self-start">
          <Link href={`/staff/inspections?request=${inspection.id}`}>Schedule it</Link>
        </Button>
      )
    case 'record':
      return (
        <ChecklistForm
          key={inspection.id}
          inspectionId={inspection.id}
          rowVersion={inspection.rowVersion}
          items={view.items}
          action={recordResultAction}
          initialNotes=""
          name={view.name}
          closing={view.closing}
        />
      )
    case 'request_reinspection':
      return (
        <Button asChild className="self-start">
          <Link
            href={`/staff/inspections?number=${encodeURIComponent(view.applicationNumber)}&reinspect=${inspection.id}`}
          >
            Request the reinspection
          </Link>
        </Button>
      )
    case 'reinspection_on_file':
      return record.followUpId === null ? null : (
        <Button asChild variant="outline" className="self-start">
          <Link href={`/staff/inspections/${record.followUpId}`}>Open the reinspection</Link>
        </Button>
      )
    case 'cancelled':
      return record.cancel === null ? null : <FactList facts={cancelFactList(record.cancel)} />
    case 'wait_schedule':
    case 'record_later':
    case 'waiting':
    case 'paused':
    case 'outcome':
      return null
  }
}

export function InspectionDoThisNow({ record }: { record: InspectionRecord }) {
  const { now } = record.plan
  return (
    <DoThisNowCard task={now.task} note={now.note} warnings={[]}>
      <LastTime record={record} />
      <CardAction record={record} />
    </DoThisNowCard>
  )
}

export function ChecklistPreview({ record }: { record: InspectionRecord }) {
  const { view } = record
  if (view.inspection.status !== 'scheduled' || view.canRecord) return null
  return (
    <section aria-label="Checklist" id="checklist">
      <h2>Checklist</h2>
      <p className="text-muted-foreground">What the inspector checks on site.</p>
      <ul className="list-none p-0">
        {view.items.map((item) => (
          <li key={item.key} className="record-item">
            {item.required ? item.label : `${item.label} (optional)`}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ResultPanel({ record }: { record: InspectionRecord }) {
  const { inspection, items } = record.view
  if (inspection.status !== 'passed' && inspection.status !== 'failed') return null
  return (
    <section aria-label="Result" id="result">
      <h2>Result</h2>
      <ul className="list-none p-0">
        {items.map((item) => (
          <li key={item.key} className="record-item flex flex-col gap-1">
            <span>{`${item.label}: ${item.outcome === null ? 'Not recorded' : OUTCOME[item.outcome]}`}</span>
            {item.note === '' ? null : <span className="text-ink-secondary">{item.note}</span>}
          </li>
        ))}
      </ul>
      {inspection.resultNotes === null ? null : <p>{`Notes: ${inspection.resultNotes}`}</p>}
    </section>
  )
}

export function PhotosPanel({ record }: { record: InspectionRecord }) {
  const { view } = record
  if (view.photos.length === 0 && !view.canAddPhotos) return null
  return (
    <section aria-label="Photos" id="photos">
      <h2>Photos</h2>
      {view.photos.length === 0 ? (
        <p className="text-muted-foreground">No photos yet.</p>
      ) : (
        <ul className="list-none p-0">
          {view.photos.map((photo) => (
            <li key={photo.documentId} className="record-item">
              <a {...NEW_TAB} href={`/api/documents/${photo.documentId}`}>
                {photo.title}
              </a>
            </li>
          ))}
        </ul>
      )}
      {view.canAddPhotos ? <InspectionPhotoUploader inspectionId={view.inspection.id} /> : null}
    </section>
  )
}
