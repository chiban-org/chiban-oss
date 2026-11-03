import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusChip } from '@/components/StatusChip'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import type { LimitedApplicationView } from '@/features/applications/limitedApplicationView'
import { applicationStatusText } from '@/features/applications/statusText'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { formatCivilDate } from '@/lib/formatDate'

function ReviewSection({ view }: { view: LimitedApplicationView }) {
  if (view.assignments.length === 0) return null
  return (
    <section aria-label="Your review" id="your-review">
      <h2>Your review</h2>
      <ul className="m-0 list-none p-0">
        {view.assignments.map((a) => (
          <li key={a.assignmentId} className="record-item flex flex-wrap items-center gap-3">
            <Link href={`/staff/reviews/${a.assignmentId}`} className="font-medium">
              Open your review
            </Link>
            <span className="text-muted-foreground">{reviewStatusLabel(a.status)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function HearingSection({ view }: { view: LimitedApplicationView }) {
  if (view.hearings.length === 0) return null
  return (
    <section aria-label="Board hearings" id="board-hearings">
      <h2>Board hearings</h2>
      <ul className="m-0 list-none p-0">
        {view.hearings.map((h) => (
          <li key={h.id} className="record-item flex flex-wrap items-center gap-3">
            <span>{h.text}</span>
            <Link href={`/board/meetings/${h.meetingId}`}>Open the meeting packet</Link>
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
      <ul className="m-0 list-none p-0">
        {view.documents.map((d) => (
          <li key={d.documentId} className="record-item flex flex-wrap items-baseline gap-3">
            <a href={`/api/documents/${d.documentId}`} className="font-medium">
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
        facts={[{ label: 'Parcel', value: view.parcelDisplayId }]}
      />
      <div className="flex flex-col gap-5">
        <p className="text-muted-foreground">{`This page shows the parts of the record ${why} needs.`}</p>
        <ReviewSection view={view} />
        <HearingSection view={view} />
        <DocumentSection view={view} />
      </div>
    </main>
  )
}
