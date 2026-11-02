import Link from 'next/link'
import {
  chargebackAction,
  correctAction,
  refundAction,
  returnedCheckAction,
} from '@/app/(staff)/staff/payments/actions'
import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { ApplicationPayments } from '@/features/payments/applicationPayments'
import { formatCents } from '@/lib/money'

type Entry = ApplicationPayments['entries'][number]

function EntryControls({ entry, payments }: { entry: Entry; payments: ApplicationPayments }) {
  if (!payments.canRefund || entry.entryType !== 'payment') return null
  return (
    <details>
      <summary>Refund, correct, or reverse</summary>
      <ActionForm action={refundAction} submitLabel="Refund">
        <input type="hidden" name="entryId" value={entry.id} />
        <TextField label="Refund amount in dollars" name="amount" inputMode="decimal" required />
        <TextField label="Reason (at least 10 characters)" name="reason" required />
      </ActionForm>
      {entry.method === 'check' ? (
        <ActionForm action={returnedCheckAction} submitLabel="Record returned check">
          <input type="hidden" name="entryId" value={entry.id} />
          <TextField label="Returned on" name="returnedOn" type="date" required />
          <TextField label="Reason (at least 10 characters)" name="reason" required />
        </ActionForm>
      ) : null}
      {entry.method === 'card_online' || entry.method === 'card_present' ? (
        <ActionForm action={chargebackAction} submitLabel="Record chargeback">
          <input type="hidden" name="entryId" value={entry.id} />
          <TextField label="Dispute reference" name="disputeRef" required />
          <TextField label="Amount in dollars" name="amount" inputMode="decimal" required />
          <TextField label="Reason (at least 10 characters)" name="reason" required />
        </ActionForm>
      ) : null}
      {payments.targets.length === 0 ? null : (
        <ActionForm action={correctAction} submitLabel="Move to another permit">
          <input type="hidden" name="entryId" value={entry.id} />
          <SelectField
            label="Move to"
            name="targetApplicationId"
            options={payments.targets.map((t): [string, string] => [t.id, t.number])}
          />
          <TextField label="Amount in dollars" name="amount" inputMode="decimal" required />
          <TextField label="Reason (at least 10 characters)" name="reason" required />
        </ActionForm>
      )}
    </details>
  )
}

export function PaymentsPanel({ payments }: { payments: ApplicationPayments | null }) {
  if (payments === null) return null
  const { balance } = payments
  return (
    <section aria-label="Payments">
      <h2>Payments</h2>
      <table className="my-2 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">Fee</th>
            <th className="text-right">Assessed</th>
            <th className="text-right">Paid</th>
            <th className="text-right">Due</th>
          </tr>
        </thead>
        <tbody>
          {balance.lines.map((line) => (
            <tr key={`${line.stage}-${line.feeCode}`} className="border-b">
              <td className="py-1">{line.label}</td>
              <td className="text-right">{formatCents(line.assessedCents)}</td>
              <td className="text-right">{formatCents(line.paidCents)}</td>
              <td className="text-right">{formatCents(line.dueCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{`Balance due ${formatCents(balance.dueCents)}.`}</p>
      {balance.unknownAttempts > 0 ? (
        <p role="alert">A card payment outcome is unknown. See Payments.</p>
      ) : null}
      {balance.pendingAttempts > 0 ? (
        <p>{`${balance.pendingAttempts} card payment waiting on the processor.`}</p>
      ) : null}
      {payments.entries.length === 0 ? (
        <p>No money has been recorded on this application.</p>
      ) : (
        <ul className="space-y-2">
          {payments.entries.map((entry) => (
            <li key={entry.id} className="rounded-md border p-2">
              <p className="m-0">
                {`${entry.businessDate} ${entry.entryType.replaceAll('_', ' ')} by ${entry.method.replaceAll('_', ' ')}${entry.checkNumber === null ? '' : ` ${entry.checkNumber}`}: ${formatCents(entry.amountCents)} from ${entry.payerName}. `}
                {entry.receiptId === null ? null : (
                  <Link
                    href={`/staff/receipts/${entry.receiptId}`}
                    className="text-action underline"
                  >
                    {`Receipt ${entry.receiptNumber ?? ''}`}
                  </Link>
                )}
              </p>
              <EntryControls entry={entry} payments={payments} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
