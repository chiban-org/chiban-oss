import {
  chargebackAction,
  refundAction,
  returnedCheckAction,
} from '@/app/(staff)/staff/payments/actions'
import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { formatCents } from '@/lib/money'

export type ReversalFormScope = { applicationId: string } | { fineId: string }

export interface ReversalTarget {
  entryId: string
  method: string
  scope: ReversalFormScope
  refundable: { label: string; cents: number }[]
}

function scopeOf(scope: ReversalFormScope): { name: string; value: string; noun: string } {
  return 'fineId' in scope
    ? { name: 'fineId', value: scope.fineId, noun: 'fine' }
    : { name: 'applicationId', value: scope.applicationId, noun: 'application' }
}

export function ReversalForms({ target }: { target: ReversalTarget }) {
  const field = scopeOf(target.scope)
  const { noun } = field
  return (
    <>
      <ActionForm
        action={refundAction}
        submitLabel="Refund"
        confirm={{
          title: 'Refund this payment?',
          body: 'The amount you entered is refunded and taken off the lines above. A card payment is refunded through the processor. This cannot be undone.',
          confirmLabel: 'Refund',
        }}
      >
        <input type="hidden" name="entryId" value={target.entryId} />
        <input type="hidden" name={field.name} value={field.value} />
        <p className="m-0 font-medium">{`A refund here reduces only these lines on this ${noun}:`}</p>
        {target.refundable.length === 0 ? (
          <p className="m-0">{`Nothing from this payment is left on this ${noun} to refund.`}</p>
        ) : (
          <ul className="m-0">
            {target.refundable.map((line) => (
              <li key={line.label}>{`${line.label}, up to ${formatCents(line.cents)}`}</li>
            ))}
          </ul>
        )}
        <TextField label="Refund amount in dollars" name="amount" inputMode="decimal" required />
        <TextField label="Reason (at least 10 characters)" name="reason" required />
      </ActionForm>
      {target.method === 'check' ? (
        <ActionForm
          action={returnedCheckAction}
          submitLabel="Record returned check"
          confirm={{
            title: 'Record this check as returned?',
            body: `The payment is reversed on this ${noun}. This cannot be undone.`,
            confirmLabel: 'Record returned check',
          }}
        >
          <input type="hidden" name="entryId" value={target.entryId} />
          <input type="hidden" name={field.name} value={field.value} />
          <TextField label="Returned on" name="returnedOn" type="date" required />
          <TextField label="Reason (at least 10 characters)" name="reason" required />
        </ActionForm>
      ) : null}
      {target.method === 'card_online' || target.method === 'card_present' ? (
        <ActionForm
          action={chargebackAction}
          submitLabel="Record chargeback"
          confirm={{
            title: 'Record this chargeback?',
            body: `The amount you entered is taken back from this payment on this ${noun}. This cannot be undone.`,
            confirmLabel: 'Record chargeback',
          }}
        >
          <input type="hidden" name="entryId" value={target.entryId} />
          <TextField label="Dispute reference" name="disputeRef" required />
          <TextField label="Amount in dollars" name="amount" inputMode="decimal" required />
          <TextField label="Reason (at least 10 characters)" name="reason" required />
        </ActionForm>
      ) : null}
    </>
  )
}
