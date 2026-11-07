import Link from 'next/link'
import { ChecklistForm } from '@/components/inspections/ChecklistForm'
import { NEW_TAB } from '@/components/newTab'
import type { InspectionView } from '@/features/inspections/inspectionView'
import { inspectionName, slotText } from '@/features/inspections/inspectorFocus'
import { formatCivilDate } from '@/lib/formatDate'
import { recordResultAction } from '../../inspections/[inspectionId]/actions'
import { InspectionRow, type InspectionsPanelData } from './inspectionsPanel'
import type { InspectorWork } from './inspectorData'

interface SectionProps {
  work: InspectorWork
  data: InspectionsPanelData
  number: string
}

function PreviousResult({ next, data }: { next: InspectionView; data: InspectionsPanelData }) {
  const previous = data.history.find((r) => r.id === next.inspection.reinspectionOf)
  if (previous?.scheduledDate == null) return null
  if (previous.status !== 'failed' && previous.status !== 'passed') return null
  return <p>{`Last time: ${previous.status} on ${formatCivilDate(previous.scheduledDate)}.`}</p>
}

function NextBody({ next, work, data }: { next: InspectionView } & Omit<SectionProps, 'number'>) {
  const { inspection } = next
  const others = inspection.inspectorUserId !== null && !next.canRecord && !next.waitingForDate
  return (
    <>
      <p className="font-serif text-xl font-semibold text-ink">{inspectionName(inspection)}</p>
      <p className="text-ink-secondary">{slotText(inspection, data.today)}</p>
      {others && work.inspectorName !== null ? <p>{`Assigned to ${work.inspectorName}`}</p> : null}
      <PreviousResult next={next} data={data} />
      {next.waitingForDate ? (
        <p role="status">This inspection can be recorded on or after its scheduled date.</p>
      ) : null}
      {next.canRecord ? (
        <ChecklistForm
          inspectionId={inspection.id}
          rowVersion={inspection.rowVersion}
          items={next.items}
          action={recordResultAction}
          initialNotes=""
        />
      ) : null}
      <p>
        <Link href={`/staff/inspections/${inspection.id}`}>
          Open the inspection for photos and the site contact
        </Link>
      </p>
    </>
  )
}

export function NextInspection({ work, data }: Omit<SectionProps, 'number'>) {
  return (
    <section
      aria-label="Next inspection"
      id="next-inspection"
      className="flex flex-col gap-3 [&>*]:m-0"
    >
      <h2 className="font-sans text-sm font-semibold text-muted-foreground">Next inspection</h2>
      {work.next === null ? (
        <p>No inspection is scheduled.</p>
      ) : (
        <NextBody next={work.next} work={work} data={data} />
      )}
    </section>
  )
}

export function LastResult({ work, data, number }: SectionProps) {
  const row = data.history.find((r) => r.id === work.last?.inspection.id)
  if (work.last === null || row === undefined) return null
  return (
    <section aria-label="Last result" id="last-result">
      <h2>Last result</h2>
      <ul className="list-none p-0">
        <InspectionRow row={row} data={data} number={number} />
      </ul>
      {work.last.photos.length === 0 ? null : (
        <ul className="list-none space-y-1 p-0">
          {work.last.photos.map((photo) => (
            <li key={photo.documentId}>
              <a {...NEW_TAB} href={`/api/documents/${photo.documentId}`}>
                {photo.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function splitHistory({ work, data }: Omit<SectionProps, 'number'>) {
  const apart = new Set([work.next?.inspection.id, work.last?.inspection.id])
  const rest = data.history.filter((r) => !apart.has(r.id))
  const isOpen = (r: (typeof rest)[number]) => r.status === 'requested' || r.status === 'scheduled'
  return { open: rest.filter(isOpen), earlier: rest.filter((r) => !isOpen(r)) }
}

export function OpenRequests({ work, data, number }: SectionProps) {
  const { open } = splitHistory({ work, data })
  const takes = data.canSchedule && data.takesRequests
  if (open.length === 0 && !takes) return null
  return (
    <section aria-label="Open requests" id="open-requests">
      <h2>Open inspection requests</h2>
      {open.length === 0 ? <p>No other inspection is requested.</p> : null}
      <ul className="list-none p-0">
        {open.map((row) => (
          <InspectionRow key={row.id} row={row} data={data} number={number} />
        ))}
      </ul>
      {takes ? (
        <p>
          <Link href={`/staff/inspections?number=${encodeURIComponent(number)}`}>
            Take an inspection request for this permit
          </Link>
        </p>
      ) : null}
    </section>
  )
}

export function EarlierInspections({ work, data, number }: SectionProps) {
  const { earlier } = splitHistory({ work, data })
  if (earlier.length === 0) return null
  return (
    <section aria-label="Earlier inspections" id="earlier-inspections">
      <details>
        <summary>{`Earlier inspections (${earlier.length})`}</summary>
        <ul className="list-none p-0">
          {earlier.map((row) => (
            <InspectionRow key={row.id} row={row} data={data} number={number} />
          ))}
        </ul>
      </details>
    </section>
  )
}
