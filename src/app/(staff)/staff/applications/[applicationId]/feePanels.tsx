import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { type FeeLineLike, feeChoices } from '@/features/fees/feeChoices'
import { formatCents } from '@/lib/money'
import { feeOverrideAction } from './clockFeeActions'

export function FeeOverrideForm({ view }: { view: StaffApplicationView }) {
  if (!view.permissions.canOverrideFee) return null
  const choices = feeChoices(
    view.fees.preview?.lines ?? null,
    view.fees.assessments.map((a) => a.computation as { lines: FeeLineLike[] }),
  )
  const labelOf = new Map(choices)
  if (choices.length === 0) return null
  return (
    <details className="my-2">
      <summary>Waive or set a fee</summary>
      <ActionForm action={feeOverrideAction} submitLabel="Save fee override">
        <input type="hidden" name="applicationId" value={view.id} />
        <SelectField label="Fee" name="feeCode" options={choices} />
        <SelectField
          label="Override"
          name="kind"
          options={[
            ['waive', 'Waive'],
            ['set_amount', 'Set an amount'],
          ]}
        />
        <TextField label="Amount in dollars (for a set amount)" name="amount" inputMode="decimal" />
        <TextField label="Reason" name="reason" required />
      </ActionForm>
      {view.fees.overrides.map((o) => (
        <p
          key={o.id}
          className="text-sm"
        >{`${labelOf.get(o.feeCode) ?? o.feeCode}: ${o.kind === 'waive' ? 'waived' : `set to ${formatCents(o.amountCents ?? 0)}`}. ${o.reason}`}</p>
      ))}
    </details>
  )
}
