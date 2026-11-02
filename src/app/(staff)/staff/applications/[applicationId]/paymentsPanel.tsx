import Link from 'next/link'
import {
  chargebackAction,
  correctAction,
  recordPaymentAction,
  refundAction,
  returnedCheckAction,
} from '@/app/(staff)/staff/payments/actions'
import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { ApplicationPayments } from '@/features/payments/applicationPayments'
import { entrySummary } from '@/features/payments/entrySummary'
import { centsToDollarInput, formatCents } from '@/lib/money'

type Entry = ApplicationPayments['entries'][number]

function EntryControls({ entry, payments }: { entry: Entry; payments: ApplicationPayments }) {
  if (!payments.canRefund || entry.entryType !== 'payment') return null
  return (
    <details>
      <summary>Refund, correct, or reverse</summary>
      <ActionForm action={refundAction} submitLabel="Refund">
        <input type="hidden" name="entryId" value={entry.id} />
        <input type="hidden" name="applicationId" value={payments.applicationId} />
        <p className="m-0 font-medium">
          A refund here reduces only these lines on this application:
        </p>
        {entry.refundable.length === 0 ? (
          <p className="m-0">Nothing from this payment is left on this application to refund.</p>
        ) : (
          <ul className="m-0">
            {entry.refundable.map((line) => (
              <li key={line.label}>{`${line.label}, up to ${formatCents(line.cents)}`}</li>
            ))}
          </ul>
        )}
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

function RecordPaymentForm({ payments }: { payments: ApplicationPayments }) {
  if (!payments.canCollect || payments.balance.dueCents <= 0) return null
  return (
    <details>
      <summary>Record a cash or check payment</summary>
      <ActionForm action={recordPaymentAction} submitLabel="Record payment">
        <input type="hidden" name="applicationId" value={payments.applicationId} />
        <SelectField
          label="Paid by"
          name="method"
          options={[
            ['check', 'Check'],
            ['cash', 'Cash'],
          ]}
        />
        <TextField
          label="Amount in dollars"
          name="amount"
          inputMode="decimal"
          defaultValue={centsToDollarInput(payments.balance.dueCents)}
          required
        />
        <TextField label="Check number (checks only)" name="checkNumber" />
        <TextField
          label="Cash tendered in dollars (cash only, to work out change)"
          name="tendered"
          inputMode="decimal"
        />
        <TextField label="Payer name" name="payerName" required />
      </ActionForm>
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
      <RecordPaymentForm payments={payments} />
      {payments.entries.length === 0 ? (
        <p>No money has been recorded on this application.</p>
      ) : (
        <ul className="space-y-2">
          {payments.entries.map((entry) => (
            <li key={entry.id} className="rounded-md border p-2">
              <p className="m-0">
                {`${entrySummary(entry)} `}
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
