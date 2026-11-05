import Link from 'next/link'
import { FactList, PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { NEW_TAB } from '@/components/newTab'
import { StatusChip } from '@/components/StatusChip'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import type { LimitedApplicationView } from '@/features/applications/limitedApplicationView'
import { applicationStatusText } from '@/features/applications/statusText'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { formatCivilDate } from '@/lib/formatDate'

function ReviewCard({ view }: { view: LimitedApplicationView }) {
  if (view.assignments.length === 0) return null
  return (
    <section aria-label="Your review" id="your-review" data-plain className="rail-card">
      <h2 className="font-sans text-sm font-semibold text-muted-foreground">Your review</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {view.assignments.map((a) => (
          <li key={a.assignmentId} className="flex flex-col gap-1">
            <Link href={`/staff/reviews/${a.assignmentId}`} className="font-semibold">
              Open your review
            </Link>
            <span className="text-sm text-muted-foreground">{reviewStatusLabel(a.status)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function LimitedRail({ view }: { view: LimitedApplicationView }) {
  return (
    <>
      <ReviewCard view={view} />
      <section aria-label="Key facts" data-plain className="rail-card">
        <FactList
          facts={[
            {
              label: 'Parcel',
              value: <Link href={`/staff/parcels/${view.parcelId}`}>{view.parcelDisplayId}</Link>,
            },
          ]}
          stacked
        />
      </section>
    </>
  )
}

function HearingSection({ view }: { view: LimitedApplicationView }) {
  if (view.hearings.length === 0) return null
  return (
    <section aria-label="Board hearings" id="board-hearings">
      <h2>Board hearings</h2>
      <ul className="list-none p-0">
        {view.hearings.map((h) => (
          <li key={h.id} className="record-item flex flex-wrap items-center gap-3">
            <span>{h.text}</span>
            {h.hasPacket ? (
              <Link href={`/board/meetings/${h.meetingId}`}>Open the meeting packet</Link>
            ) : (
              <span className="text-muted-foreground">The meeting packet is not ready yet.</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function DocumentSection({ view }: { view: LimitedApplicationView }) {
  return (
    <section aria-label="Documents" id="documents">
      <h2>Documents</h2>
      {view.documents.length === 0 ? <p>No documents are shared with you.</p> : null}
      <ul className="list-none p-0">
        {view.documents.map((d) => (
          <li key={d.documentId} className="record-item flex flex-wrap items-baseline gap-3">
            <a {...NEW_TAB} href={`/api/documents/${d.documentId}`} className="font-medium">
              {d.title}
            </a>
            <span className="text-sm text-muted-foreground">
              {`Added ${formatCivilDate(d.createdAt.slice(0, 10))}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function LimitedRecord({ view }: { view: LimitedApplicationView }) {
  const why = view.assignments.length > 0 ? 'your review' : 'your board work'
  const sections = splitPanels([
    { empty: false, node: <HearingSection key="hearings" view={view} /> },
    { empty: view.documents.length === 0, node: <DocumentSection key="documents" view={view} /> },
  ])
  return (
    <main>
      <PageHeader
        kicker={view.typeLabel}
        title={view.number}
        status={
          <StatusChip
            status={applicationChipStatus(view.state)}
            label={applicationStatusText(view.state, view.substep, view.substeps)}
          />
        }
        lead={view.projectTitle}
      />
      <RecordLayout rail={<LimitedRail view={view} />} empty={sections.empty}>
        <p className="text-muted-foreground">{`This page shows the parts of the record ${why} needs.`}</p>
        {sections.filled}
      </RecordLayout>
    </main>
  )
}
