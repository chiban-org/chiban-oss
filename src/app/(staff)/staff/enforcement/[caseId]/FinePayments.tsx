import Link from 'next/link'
import { ReversalForms } from '@/app/(staff)/staff/payments/ReversalForms'
import { NEW_TAB } from '@/components/newTab'
import type { CasePaymentEntry } from '@/features/payments/casePayments'
import { entrySummary } from '@/features/payments/entrySummary'

export function FinePayments({
  fineId,
  fineLabel,
  entries,
  canRefund,
}: {
  fineId: string
  fineLabel: string
  entries: readonly CasePaymentEntry[]
  canRefund: boolean
}) {
  if (entries.length === 0) return null
  return (
    <ul className="list-none p-0">
      {entries.map((entry) => (
        <li key={entry.id} className="pb-2">
          <p className="m-0">
            {`${entrySummary(entry)} `}
            {entry.receiptId === null ? null : (
              <Link {...NEW_TAB} href={`/staff/receipts/${entry.receiptId}`}>
                {`Receipt ${entry.receiptNumber ?? ''}`}
              </Link>
            )}
            {entry.paymentAttemptId === null ? null : (
              <>
                {' '}
                <Link href={`/staff/payments/${entry.paymentAttemptId}`}>Card payment</Link>
              </>
            )}
          </p>
          {canRefund && entry.entryType === 'payment' ? (
            <details>
              <summary className="cursor-pointer font-medium">Refund or reverse</summary>
              <ReversalForms
                target={{
                  entryId: entry.id,
                  method: entry.method,
                  scope: { fineId },
                  refundable:
                    entry.refundableCents > 0
                      ? [{ label: fineLabel, cents: entry.refundableCents }]
                      : [],
                }}
              />
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
