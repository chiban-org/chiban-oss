import Link from 'next/link'
import { FactList, PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { NEW_TAB } from '@/components/newTab'
import { StatusChip } from '@/components/StatusChip'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import type { LimitedApplicationView } from '@/features/applications/limitedApplicationView'
import { applicationStatusText } from '@/features/applications/statusText'
import { formatCivilDate } from '@/lib/formatDate'
import { ProjectSummary, ReviewCard, reviewSentence } from './limitedReview'

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
    <section aria-label="Plan documents" id="plan-documents">
      <h2>Plan documents</h2>
      {view.documents.length === 0 ? <p>No plan documents are shared with you.</p> : null}
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
  const sentence = reviewSentence(view)
  const sections = splitPanels([
    { empty: view.summary.length === 0, node: <ProjectSummary key="summary" view={view} /> },
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
        summary={
          sentence === null ? undefined : (
            <p data-slot="status-sentence" className="max-w-[75ch]">
              {sentence}
            </p>
          )
        }
      />
      <RecordLayout rail={<LimitedRail view={view} />} empty={sections.empty}>
        <p className="text-muted-foreground">{`This page shows the parts of the record ${why} needs.`}</p>
        {sections.filled}
      </RecordLayout>
    </main>
  )
}
