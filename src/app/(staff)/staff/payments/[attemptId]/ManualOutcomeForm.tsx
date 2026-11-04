import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import type { paymentAttempts } from '@/db/schema'
import { MANUAL_OUTCOME_LABELS } from '@/features/payments/manualOutcomeCheck'
import { recordOutcomeByHandAction } from '../actions'

type Attempt = typeof paymentAttempts.$inferSelect

const OUTCOME_OPTIONS = [
  ['', 'Choose one'],
  ['declined', MANUAL_OUTCOME_LABELS.declined],
  ['approved', MANUAL_OUTCOME_LABELS.approved],
] as const

export function ManualOutcomeForm({ attempt }: { attempt: Attempt }) {
  return (
    <ActionForm action={recordOutcomeByHandAction} submitLabel="Record outcome" variant="default">
      <input type="hidden" name="attemptId" value={attempt.id} />
      <SelectField
        label="What the processor confirmed"
        name="outcome"
        options={OUTCOME_OPTIONS}
        required
      />
      {attempt.processorObjectId === null ? (
        <TextField
          label="Processor reference"
          name="processorRef"
          hint="Needed when the processor confirms it was approved."
        />
      ) : null}
      <AreaField
        label="Note (at least 10 characters)"
        name="note"
        hint="The processor reference, or who you spoke to."
        required
      />
    </ActionForm>
  )
}
