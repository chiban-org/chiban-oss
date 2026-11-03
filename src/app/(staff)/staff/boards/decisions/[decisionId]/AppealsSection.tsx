import { ActionForm } from '@/components/ActionForm'
import { AppealGraph } from '@/components/appeals/AppealGraph'
import { SelectField, TextField } from '@/components/staff/fields'
import type { DecisionView } from '@/features/decisions/decisionView'
import { addAppealNodeAction } from '../../hearings/decisionActions'

const APPEAL_STEPS: [string, string][] = [
  ['rehearing_motion', 'Motion for rehearing'],
  ['rehearing_outcome', 'Rehearing decision'],
  ['court_petition', 'Court petition'],
  ['zba_appeal', 'Appeal to the Zoning Board'],
  ['zba_decision', 'Zoning Board decision'],
]

export function AppealsSection({ view, today }: { view: DecisionView; today: string }) {
  return (
    <section aria-labelledby="appeals" className="space-y-4">
      <h2 id="appeals">Appeals</h2>
      <AppealGraph nodes={view.graph} />
      <details>
        <summary>Record an appeal step</summary>
        <ActionForm action={addAppealNodeAction} submitLabel="Record" className="max-w-md">
          <SelectField
            label="Follows"
            name="parentId"
            options={view.nodeChoices.map((n): [string, string] => [n.id, n.label])}
          />
          <SelectField label="Step" name="kind" options={APPEAL_STEPS} />
          <TextField
            label="Date"
            name="occurredOn"
            type="date"
            defaultValue={today}
            max={today}
            required
          />
          <SelectField
            label="Result, for a rehearing decision or a decision after appeal"
            name="outcome"
            options={[
              ['', 'Not applicable'],
              ['granted', 'Rehearing granted'],
              ['denied', 'Denied'],
              ['approved', 'Approved'],
            ]}
          />
          <SelectField
            label="Is this the Zoning Board part of a Planning Board decision?"
            name="linked"
            options={[
              ['no', 'No'],
              ['yes', 'Yes'],
            ]}
          />
        </ActionForm>
      </details>
    </section>
  )
}
