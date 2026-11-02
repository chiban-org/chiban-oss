import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { formatCents } from '@/lib/money'
import { feeOverrideAction } from './clockFeeActions'

export function FeeOverrideForm({ view }: { view: StaffApplicationView }) {
  if (!view.permissions.canOverrideFee) return null
  const codes = view.fees.preview?.lines.map((l) => l.code) ?? [
    ...new Set(
      view.fees.assessments.flatMap((a) =>
        (a.computation as { lines: { code: string }[] }).lines.map((l) => l.code),
      ),
    ),
  ]
  if (codes.length === 0) return null
  return (
    <details className="my-2">
      <summary>Waive or set a fee</summary>
      <ActionForm action={feeOverrideAction} submitLabel="Save fee override">
        <input type="hidden" name="applicationId" value={view.id} />
        <SelectField
          label="Fee"
          name="feeCode"
          options={codes.map((c): [string, string] => [c, c])}
        />
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
        >{`${o.feeCode}: ${o.kind === 'waive' ? 'waived' : `set to ${formatCents(o.amountCents ?? 0)}`}. ${o.reason}`}</p>
      ))}
    </details>
  )
}
