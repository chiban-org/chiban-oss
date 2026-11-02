import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatusTimeline } from '@/components/portal/StatusTimeline'
import { StatusChip } from '@/components/StatusChip'
import { env } from '@/config/env'
import { displayFieldValue } from '@/features/forms/displayValue'
import { honestText } from '@/features/honest/honest'
import { loadPortalBoardRecord, type PortalBoardRecord } from '@/features/portal/boardRecord'
import { getPortalApplicationView, type PortalApplicationView } from '@/features/portal/portalView'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate, formatInstant } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { requirePortalContext } from '@/server/requirePortal'
import { PortalApplicationForm, PortalPayButton } from './PayAndForm'
import { UploadSection } from './UploadSection'

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
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[14rem_1fr]">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="font-medium">{r.label}</dt>
          <dd className="m-0">{r.text}</dd>
        </div>
      ))}
    </dl>
  )
}

function Fees({ view }: { view: PortalApplicationView }) {
  const { fees } = view
  if (fees.lines.length === 0) return <p>No fees have been set for this application yet.</p>
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

function BoardRecordSection({ record }: { record: PortalBoardRecord }) {
  if (record.hearings.length + record.decisions.length + record.deadlines.length === 0) return null
  return (
    <section aria-labelledby="board-heading" className="space-y-2">
      <h2 id="board-heading">Board hearing and decision</h2>
      <ul className="m-0 space-y-1">
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
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  const board = await loadPortalBoardRecord(ctx.db, ctx.actor, applicationId, ctx.signal)
  return (
    <main className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0">{`${view.typeLabel} ${view.number}`}</h1>
          <StatusChip
            status={view.state === 'issued' ? 'passed' : 'neutral'}
            label={view.stateLabel}
          />
        </div>
        <p className="m-0">
          {`${honestText(view.parcel.siteAddress, 'Address not on file')}${view.parcel.displayId === null ? '' : `, parcel ${view.parcel.displayId}`}`}
        </p>
        <StatusTimeline state={view.state} />
        {view.decisionDue === null ? null : (
          <p className="m-0">{`The town's decision is due ${formatCivilDate(view.decisionDue.date)}. ${view.decisionDue.consequence}`}</p>
        )}
      </header>

      <section aria-labelledby="details-heading" className="space-y-3">
        <h2 id="details-heading">Application</h2>
        {view.canEdit && view.form !== null ? (
          <PortalApplicationForm
            applicationId={view.applicationId}
            form={view.form}
            initialValues={view.values}
            attestationText={view.attestationText}
            attestationSha256={view.attestationSha256}
          />
        ) : (
          <Details view={view} />
        )}
      </section>

      {board.ok ? <BoardRecordSection record={board.value} /> : null}

      {view.conditions.length === 0 ? null : (
        <section aria-labelledby="conditions-heading" className="space-y-2">
          <h2 id="conditions-heading">Conditions</h2>
          <ul className="m-0 space-y-1">
            {view.conditions.map((c) => (
              <li key={c.text}>{`${c.text} (${CONDITION_STATUS[c.status]})`}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="documents-heading" className="space-y-3">
        <h2 id="documents-heading">Documents</h2>
        {view.documents.length === 0 ? (
          <p>No documents yet.</p>
        ) : (
          <ul className="m-0 space-y-1">
            {view.documents.map((d) => (
              <li key={d.documentId}>
                <Link
                  href={`/api/documents/${d.documentId}`}
                  className="tap-target inline-flex items-center underline"
                >
                  {d.title}
                </Link>
                <span className="ml-2 text-muted-foreground">
                  {formatInstant(new Date(d.createdAt), zone)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {view.canUpload ? (
          <UploadSection applicationId={view.applicationId} maxBytes={env.MAX_UPLOAD_BYTES} />
        ) : null}
      </section>

      {view.state === 'issued' || view.state === 'suspended' || view.state === 'closed' ? (
        <section aria-labelledby="inspections-heading" className="space-y-3">
          <h2 id="inspections-heading">Inspections</h2>
          <Link
            href={`/portal/applications/${view.applicationId}/inspections`}
            className="tap-target inline-flex items-center underline"
          >
            Request or review inspections
          </Link>
        </section>
      ) : null}

      <section aria-labelledby="fees-heading" className="space-y-3">
        <h2 id="fees-heading">Fees and payment</h2>
        <Fees view={view} />
        {view.receipts.length === 0 ? null : (
          <ul className="m-0 space-y-1">
            {view.receipts.map((r) => (
              <li key={r.receiptId}>
                <a
                  href={`/portal/applications/${view.applicationId}/receipts/${r.receiptId}`}
                  className="tap-target inline-flex items-center underline"
                >{`Receipt ${r.number}, ${formatCents(r.totalCents)}, ${formatCivilDate(r.date)}`}</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
