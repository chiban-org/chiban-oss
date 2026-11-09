import { NEW_TAB } from '@/components/newTab'
import type { PaymentReturnDetails } from '@/features/payments/paymentReturn'
import type { TownOffice } from '@/features/town/publicTown'
import { formatCents } from '@/lib/money'

const LINK = 'tap-target inline-flex items-center'

export function ApplicationLinks({
  details,
  label,
}: {
  details: PaymentReturnDetails
  label: (number: string) => string
}) {
  if (details.applications.length === 0) return null
  return (
    <ul className="m-0 list-none p-0">
      {details.applications.map((a) => (
        <li key={a.id}>
          <a href={`/portal/applications/${a.id}`} className={LINK}>
            {label(a.number)}
          </a>
        </li>
      ))}
    </ul>
  )
}

export function ReceivedReceipt({
  details,
  attemptId,
}: {
  details: PaymentReturnDetails
  attemptId: string
}) {
  return (
    <section aria-labelledby="receipt-heading">
      <h2 id="receipt-heading">
        {details.receiptNumber === null ? 'Receipt' : `Receipt ${details.receiptNumber}`}
      </h2>
      <p>The town has recorded your payment.</p>
      <table className="w-full max-w-2xl">
        <caption className="sr-only">What this payment covered</caption>
        <thead>
          <tr>
            <th scope="col" className="text-left">
              Application
            </th>
            <th scope="col" className="text-left">
              Fee
            </th>
            <th scope="col" className="text-right">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {details.lines.map((line, index) => (
            <tr key={`${line.reference}-${line.label}-${index}`}>
              <td className="whitespace-nowrap">{line.reference}</td>
              <td>{line.label}</td>
              <td className="text-right tabular-nums">{formatCents(line.amountCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2} className="text-left">
              Total paid
            </th>
            <td className="text-right font-semibold tabular-nums">
              {formatCents(details.amountCents ?? 0)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-4">
        <a {...NEW_TAB} href={`/payments/receipt/${attemptId}`} className={LINK}>
          Open your receipt (PDF, opens in a new tab)
        </a>
      </p>
      <ApplicationLinks details={details} label={(n) => `Back to ${n}`} />
    </section>
  )
}

export function NotFoundHelp({
  signedIn,
  attemptId,
  office,
}: {
  signedIn: boolean
  attemptId: string
  office: TownOffice
}) {
  const next = encodeURIComponent(`/payments/return/${attemptId}`)
  return (
    <div className="flex max-w-[65ch] flex-col gap-3">
      <p className="m-0">
        {signedIn
          ? 'This payment is not on your account. A payment page opens only for the person who made the payment.'
          : 'A payment page opens only for the person who made the payment. Sign in with the email you paid with to see it.'}
      </p>
      {signedIn ? (
        <p className="m-0">
          <a href="/portal" className={LINK}>
            Go to your applications
          </a>
        </p>
      ) : (
        <p className="m-0">
          <a href={`/sign-in?next=${next}`} className={LINK}>
            Sign in to see this payment
          </a>
        </p>
      )}
      <p className="m-0">Your application page shows every payment.</p>
      {office.phone === '' ? null : (
        <p className="m-0">{`Questions about a payment? Call the ${office.officeName} at ${office.phone}.`}</p>
      )}
    </div>
  )
}
