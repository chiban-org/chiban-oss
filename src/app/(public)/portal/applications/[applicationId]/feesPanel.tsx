import { NEW_TAB } from '@/components/newTab'
import { moneyEntrySentence } from '@/features/portal/moneyHistory'
import type { PortalApplicationView } from '@/features/portal/portalView'
import { formatCents } from '@/lib/money'

const ESTIMATE_DUE = {
  at_intake: 'when the application is submitted',
  at_approval: 'when the town approves the application',
} as const

function NoFeesYet({ view }: { view: PortalApplicationView }) {
  if (view.feeEstimate === null) return <p>No fees have been set for this application yet.</p>
  const amount = formatCents(view.feeEstimate.totalCents)
  const due = ESTIMATE_DUE[view.feeEstimate.due]
  if (view.state === 'draft') {
    return (
      <p>{`No fees are due yet. From the answers saved so far, the estimated fee is ${amount}, due ${due}. Save the draft to update it.`}</p>
    )
  }
  return (
    <p>{`No fees are due yet. The town sets the fee when it reviews the application. From your answers the estimate is ${amount}, due ${due}.`}</p>
  )
}

function PayLine({ view, officeName }: { view: PortalApplicationView; officeName: string }) {
  if (view.payAtOffice) {
    return <p className="m-0">{`Pay ${formatCents(view.fees.dueCents)} at the ${officeName}.`}</p>
  }
  if (!view.canPay) return null
  return (
    <p className="m-0">
      <a href="#do-this-now" className="tap-target inline-flex items-center">
        Pay online from the top of this page
      </a>
    </p>
  )
}

function Fees({ view, officeName }: { view: PortalApplicationView; officeName: string }) {
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
      <PayLine view={view} officeName={officeName} />
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

export function FeesPanel({
  view,
  officeName,
}: {
  view: PortalApplicationView
  officeName: string
}) {
  return (
    <section aria-labelledby="fees-heading">
      <h2 id="fees-heading">Fees and payment</h2>
      <Fees view={view} officeName={officeName} />
      <MoneyHistory view={view} />
    </section>
  )
}
