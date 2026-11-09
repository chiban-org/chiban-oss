import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DescriptionList } from '@/components/ui/description-list'
import { db } from '@/db/client'
import type { DocumentChecklistView } from '@/features/applications/documentChecklistView'
import { loadDocumentChecklist } from '@/features/applications/documentChecklistView'
import { isSettledStatus } from '@/features/applications/liveChecklist'
import { displayFieldValue } from '@/features/forms/displayValue'
import { applicantStatus, missingNow } from '@/features/portal/applicantStatus'
import { loadPortalBoardRecord, type PortalBoardRecord } from '@/features/portal/boardRecord'
import { getPortalApplicationView, type PortalApplicationView } from '@/features/portal/portalView'
import { portalRecordTitle } from '@/features/portal/recordTitle'
import { getTownSettings } from '@/features/town/settings'
import { portalActorOrNull, requirePortalContext } from '@/server/requirePortal'
import { EndingActions } from './EndingPanel'
import { FeesPanel } from './feesPanel'
import { PortalApplicationForm } from './PayAndForm'
import { PortalDocuments } from './PortalDocuments'
import { RecordHeader } from './recordHeader'

export const dynamic = 'force-dynamic'

const DEFAULT_ZONE = 'America/New_York'
const CONDITION_STATUS = { unmet: 'Open', met: 'Met', waived: 'Waived' } as const
const TITLE_TIMEOUT_MS = 10_000

interface Props {
  params: Promise<{ applicationId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { applicationId } = await params
  const signal = AbortSignal.timeout(TITLE_TIMEOUT_MS)
  const actor = await portalActorOrNull(signal)
  const title = await portalRecordTitle(db, actor, applicationId, signal)
  return { title: title ?? 'Your application' }
}

function Details({ view }: { view: PortalApplicationView }) {
  const fields = view.form?.fields ?? []
  const rows = fields.flatMap((field) => {
    const value = view.values[field.key]
    return value === undefined || value === ''
      ? []
      : [{ label: field.label, text: displayFieldValue(field, value) }]
  })
  if (rows.length === 0) return <p>No details were entered.</p>
  return (
    <DescriptionList
      labelWidth="wide"
      items={rows.map((r) => ({ label: r.label, value: r.text }))}
    />
  )
}

function BoardRecordSection({ record }: { record: PortalBoardRecord }) {
  if (record.hearings.length + record.decisions.length + record.deadlines.length === 0) return null
  return (
    <section aria-labelledby="board-heading">
      <h2 id="board-heading">Board hearing and decision</h2>
      <ul className="space-y-1">
        {[...record.hearings, ...record.decisions, ...record.deadlines].map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}

function requirementsOf(checklist: DocumentChecklistView | null) {
  const rows = checklist?.stages.flatMap((s) => s.rows) ?? []
  return rows
    .filter((r) => r.stage === 'to_file')
    .map((r) => ({
      label: r.label,
      requiredIf: r.requiredIf,
      optional: r.optional,
      settled: isSettledStatus(r.status),
    }))
}

function DocumentsSection(props: {
  view: PortalApplicationView
  checklist: DocumentChecklistView | null
  zone: string
}) {
  return (
    <section aria-labelledby="documents-heading">
      <h2 id="documents-heading">Documents</h2>
      <PortalDocuments {...props} />
    </section>
  )
}

export default async function PortalApplicationPage({ params }: Props) {
  const { applicationId } = await params
  const ctx = await requirePortalContext(`/portal/applications/${applicationId}`)
  const result = await getPortalApplicationView(ctx.db, ctx.actor, applicationId, ctx.signal)
  if (!result.ok) notFound()
  const view = result.value
  const [town, board, checklist] = await Promise.all([
    getTownSettings(ctx.db, ctx.signal),
    loadPortalBoardRecord(ctx.db, ctx.actor, applicationId, ctx.signal),
    loadDocumentChecklist(ctx.db, ctx.actor, applicationId, ctx.signal),
  ])
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  const status = applicantStatus({
    state: view.state,
    board: view.record.board,
    dueCents: view.canPay ? view.fees.dueCents : 0,
    missingDocuments: missingNow(checklist?.stages.flatMap((s) => s.rows) ?? [], view.state),
    decisionDue: view.decisionDue?.date ?? null,
    decisionLate: view.decisionDue?.late ?? false,
    canRequestInspection: view.isParty && view.state === 'issued' && view.record.hasInspections,
  })
  const editing = view.canEdit && view.form !== null
  const documents = <DocumentsSection view={view} checklist={checklist} zone={zone} />
  return (
    <main>
      <RecordHeader view={view} status={status} />

      <section aria-labelledby="details-heading">
        <h2 id="details-heading">Application</h2>
        {editing && view.form !== null ? (
          <PortalApplicationForm
            applicationId={view.applicationId}
            form={view.form}
            initialValues={view.values}
            attestationText={view.attestationText}
            attestationSha256={view.attestationSha256}
            requirements={requirementsOf(checklist)}
            documents={documents}
          />
        ) : (
          <Details view={view} />
        )}
      </section>

      {board.ok ? <BoardRecordSection record={board.value} /> : null}

      {view.conditions.length === 0 ? null : (
        <section aria-labelledby="conditions-heading">
          <h2 id="conditions-heading">Conditions</h2>
          <ul className="space-y-1">
            {view.conditions.map((c) => (
              <li key={c.text}>{`${c.text} (${CONDITION_STATUS[c.status]})`}</li>
            ))}
          </ul>
        </section>
      )}

      {editing ? null : documents}

      {view.state === 'issued' || view.state === 'suspended' || view.state === 'closed' ? (
        <section aria-labelledby="inspections-heading">
          <h2 id="inspections-heading">Inspections</h2>
          <Link
            href={`/portal/applications/${view.applicationId}/inspections`}
            className="tap-target inline-flex items-center"
          >
            Request or review inspections
          </Link>
        </section>
      ) : null}

      <FeesPanel view={view} />
      <EndingActions view={view} />
    </main>
  )
}
