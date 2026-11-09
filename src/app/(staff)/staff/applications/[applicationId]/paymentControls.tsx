import {
  chargebackAction,
  correctAction,
  recordPaymentAction,
  refundAction,
  returnedCheckAction,
} from '@/app/(staff)/staff/payments/actions'
import { startCardAction } from '@/app/(staff)/staff/payments/cardActions'
import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { ApplicationPayments } from '@/features/payments/applicationPayments'
import { centsToDollarInput, formatCents } from '@/lib/money'
import { checkAction, readerAction, reconnectAction } from '../../counter/readerActions'
import { CardAtCounter } from './cardAtCounter'

const CARD_ACTIONS = {
  start: startCardAction,
  reader: readerAction,
  check: checkAction,
  reconnect: reconnectAction,
}

function CardOption({ payments }: { payments: ApplicationPayments }) {
  const { reader, feeCents } = payments.card
  if (!reader.available) return <p className="text-sm">{reader.reason}</p>
  return (
    <CardAtCounter
      applicationId={payments.applicationId}
      dueCents={payments.balance.dueCents}
      feeCents={feeCents}
      simulated={reader.simulated}
      actions={CARD_ACTIONS}
    />
  )
}

type Entry = ApplicationPayments['entries'][number]

export function EntryControls({
  entry,
  payments,
}: {
  entry: Entry
  payments: ApplicationPayments
}) {
  if (!payments.canRefund || entry.entryType !== 'payment') return null
  return (
    <details>
      <summary>Refund, correct, or reverse</summary>
      <ActionForm
        action={refundAction}
        submitLabel="Refund"
        confirm={{
          title: 'Refund this payment?',
          body: 'The amount you entered is refunded and taken off the lines above. A card payment is refunded through the processor. This cannot be undone.',
          confirmLabel: 'Refund',
        }}
      >
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
        <ActionForm
          action={returnedCheckAction}
          submitLabel="Record returned check"
          confirm={{
            title: 'Record this check as returned?',
            body: 'The payment is reversed on this application. This cannot be undone.',
            confirmLabel: 'Record returned check',
          }}
        >
          <input type="hidden" name="entryId" value={entry.id} />
          <TextField label="Returned on" name="returnedOn" type="date" required />
          <TextField label="Reason (at least 10 characters)" name="reason" required />
        </ActionForm>
      ) : null}
      {entry.method === 'card_online' || entry.method === 'card_present' ? (
        <ActionForm
          action={chargebackAction}
          submitLabel="Record chargeback"
          confirm={{
            title: 'Record this chargeback?',
            body: 'The amount you entered is taken back from this payment on this application. This cannot be undone.',
            confirmLabel: 'Record chargeback',
          }}
        >
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

export function PaymentForm({
  payments,
  variant = 'outline',
}: {
  payments: ApplicationPayments
  variant?: 'default' | 'outline'
}) {
  return (
    <>
      <ActionForm action={recordPaymentAction} submitLabel="Record payment" variant={variant}>
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
      <CardOption payments={payments} />
    </>
  )
}

export function mayRecordPayment(payments: ApplicationPayments | null): boolean {
  return payments?.canCollect === true && payments.balance.dueCents > 0
}

export function RecordPaymentForm({ payments }: { payments: ApplicationPayments }) {
  if (!mayRecordPayment(payments)) return null
  return (
    <details>
      <summary>Take a payment</summary>
      <PaymentForm payments={payments} />
    </details>
  )
}
