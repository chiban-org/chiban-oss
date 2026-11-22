import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import type { DecisionView } from '@/features/decisions/decisionView'
import { markLastApprovalAction } from './finalApprovalActions'

export function FinalApprovalSection({ view, today }: { view: DecisionView; today: string }) {
  if (!view.offerLastApprovalLater) return null
  return (
    <section aria-labelledby="last-approval">
      <h2 id="last-approval">Last municipal approval</h2>
      <p>
        Mark this decision when it turns out to be the last approval the town gives the project. The
        appeal deadlines that wait for the last approval start on the date you enter.
      </p>
      <ActionForm
        action={markLastApprovalAction}
        submitLabel="Mark this the last municipal approval"
        variant="default"
        className="max-w-md"
      >
        <input type="hidden" name="decisionId" value={view.decisionId} />
        <TextField
          label="Date of the last municipal approval"
          name="approvedOn"
          type="date"
          defaultValue={today}
          min={view.votedOn}
          max={today}
          required
        />
      </ActionForm>
    </section>
  )
}
