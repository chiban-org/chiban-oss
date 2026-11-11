import Link from 'next/link'
import { correctAction, recordPaymentAction } from '@/app/(staff)/staff/payments/actions'
import { startCardAction } from '@/app/(staff)/staff/payments/cardActions'
import { ReversalForms } from '@/app/(staff)/staff/payments/ReversalForms'
import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { ApplicationPayments } from '@/features/payments/applicationPayments'
import { centsToDollarInput } from '@/lib/money'
import { checkAction, readerAction, reconnectAction } from '../../counter/readerActions'
import { CardAtCounter } from './cardAtCounter'

const CARD_ACTIONS = {
  start: startCardAction,
  reader: readerAction,
  check: checkAction,
  reconnect: reconnectAction,
}

function CardOption({ payments }: { payments: ApplicationPayments }) {
  const { reader, feeCents, openAttempt } = payments.card
  if (openAttempt?.channel === 'card_online') {
    return (
      <p className="text-sm">
        {'A card payment started online is still open on this application. '}
        <Link href={`/staff/payments/${openAttempt.id}`}>Open the card payment</Link>
      </p>
    )
  }
  if (!reader.available) return <p className="text-sm">{reader.reason}</p>
  return (
    <CardAtCounter
      applicationId={payments.applicationId}
      dueCents={payments.balance.dueCents}
      feeCents={feeCents}
      simulated={reader.simulated}
      actions={CARD_ACTIONS}
      resume={
        openAttempt === null
          ? null
          : { attemptId: openAttempt.id, outcomeUnknown: openAttempt.outcomeUnknown }
      }
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
      <ReversalForms
        target={{
          entryId: entry.id,
          method: entry.method,
          scope: { applicationId: payments.applicationId },
          refundable: entry.refundable,
        }}
      />
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
