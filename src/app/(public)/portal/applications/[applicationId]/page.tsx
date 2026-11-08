import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { NEW_TAB } from '@/components/newTab'
import { StatusTimeline } from '@/components/portal/StatusTimeline'
import { StatusChip } from '@/components/StatusChip'
import { DescriptionList } from '@/components/ui/description-list'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import { loadDocumentChecklist } from '@/features/applications/documentChecklistView'
import { displayFieldValue } from '@/features/forms/displayValue'
import { honestText } from '@/features/honest/honest'
import { loadPortalBoardRecord, type PortalBoardRecord } from '@/features/portal/boardRecord'
import { moneyEntrySentence } from '@/features/portal/moneyHistory'
import { getPortalApplicationView, type PortalApplicationView } from '@/features/portal/portalView'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { requirePortalContext } from '@/server/requirePortal'
import { PortalApplicationForm, PortalPayButton } from './PayAndForm'
import { PortalDocuments } from './PortalDocuments'

export const metadata: Metadata = { title: 'Your application' }

export const dynamic = 'force-dynamic'

const DEFAULT_ZONE = 'America/New_York'
const CONDITION_STATUS = { unmet: 'Open', met: 'Met', waived: 'Waived' } as const

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

const ESTIMATE_DUE = {
  at_intake: 'when the application is submitted',
  at_approval: 'when the town approves the application',
} as const

function NoFeesYet({ view }: { view: PortalApplicationView }) {
  if (view.feeEstimate === null) return <p>No fees have been set for this application yet.</p>
  return (
    <p>{`No fees are due yet. The estimated fee is ${formatCents(view.feeEstimate.totalCents)}, due ${ESTIMATE_DUE[view.feeEstimate.due]}.`}</p>
  )
}

function Fees({ view }: { view: PortalApplicationView }) {
  const { fees } = view
  if (fees.lines.length === 0) return <NoFeesYet view={view} />
  return (
    <>
      <ul className="m-0 list-none space-y-1 p-0">
        {fees.lines.map((line) => (
          <li key={`${line.feeAssessmentId}-${line.feeCode}`}>
            {`${line.label}: ${formatCents(line.assessedCents)}, paid ${formatCents(line.paidCents)}`}
          </li>
        ))}
      </ul>
      <p className="font-semibold">
        {fees.dueCents > 0 ? `Balance due ${formatCents(fees.dueCents)}` : 'Nothing is due.'}
      </p>
      {fees.pendingAttempts + fees.unknownAttempts > 0 ? (
        <p role="status">A card payment is waiting for the payment service to confirm.</p>
      ) : null}
      {view.canPay ? (
        <>
          {view.convenienceCents > 0 ? (
            <p className="m-0">{`Paying online includes a ${formatCents(view.convenienceCents)} card convenience fee.`}</p>
          ) : null}
          <PortalPayButton applicationId={view.applicationId} dueCents={view.onlineTotalCents} />
        </>
      ) : null}
    </>
  )
}

function MoneyHistory({ view }: { view: PortalApplicationView }) {
  if (view.history.length === 0) return null
  return (
    <>
      <h3>Payment history</h3>
      <ul className="m-0 space-y-1">
        {view.history.map((entry) => (
          <li key={entry.entryId}>
            {moneyEntrySentence(entry)}
            {entry.receiptId === null ? null : (
              <>
                {' '}
                <a
                  {...NEW_TAB}
                  href={`/portal/applications/${view.applicationId}/receipts/${entry.receiptId}`}
                  className="tap-target inline-flex items-center"
                >{`Receipt ${entry.receiptNumber ?? ''}`}</a>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
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

export default async function PortalApplicationPage({
  params,
}: {
  params: Promise<{ applicationId: string }>
}) {
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
  return (
    <main>
      <PageHeader
        kicker={view.typeLabel}
        title={view.number}
        status={<StatusChip status={applicationChipStatus(view.state)} label={view.stateLabel} />}
        lead={`${honestText(view.parcel.siteAddress, 'Address not on file')}${view.parcel.displayId === null ? '' : `, parcel ${view.parcel.displayId}`}`}
        actions={
          <div className="flex flex-col gap-4 pt-2">
            <StatusTimeline state={view.state} />
            {view.decisionDue === null ? null : (
              <p className="m-0 max-w-[65ch]">
                <span className="attention">{`The town's decision is due ${formatCivilDate(view.decisionDue.date)}.`}</span>
                {` ${view.decisionDue.consequence}`}
              </p>
            )}
          </div>
        }
      />

      <section aria-labelledby="details-heading">
        <h2 id="details-heading">Application</h2>
        {view.canEdit && view.form !== null ? (
          <PortalApplicationForm
            applicationId={view.applicationId}
            form={view.form}
            initialValues={view.values}
            attestationText={view.attestationText}
            attestationSha256={view.attestationSha256}
            missingDocuments={checklist?.missingToFile ?? []}
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

      <section aria-labelledby="documents-heading">
        <h2 id="documents-heading">Documents</h2>
        <PortalDocuments view={view} checklist={checklist} zone={zone} />
      </section>

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

      <section aria-labelledby="fees-heading">
        <h2 id="fees-heading">Fees and payment</h2>
        <Fees view={view} />
        <MoneyHistory view={view} />
      </section>
    </main>
  )
}
