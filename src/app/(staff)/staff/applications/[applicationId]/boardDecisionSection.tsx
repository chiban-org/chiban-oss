import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { BoardPanelData } from '@/features/boards/panelData'
import { certificationAction, finalApprovalAction } from '../../boards/actions'

const APPROVED_STATES: readonly string[] = ['decided', 'issued', 'suspended', 'closed', 'expired']

const AWAITING_FINAL_APPROVAL: readonly string[] = ['decided', 'issued']

export function showsExercise(data: BoardPanelData): boolean {
  if (!data.hasExercise) return false
  const states = data.exerciseText === null ? AWAITING_FINAL_APPROVAL : APPROVED_STATES
  return states.includes(data.state)
}

export function DecisionSection({ data }: { data: BoardPanelData }) {
  const exercise = showsExercise(data)
  if (!data.certification.offered && data.certification.history.length === 0 && !exercise)
    return null
  return (
    <section aria-label="Decision follow-up">
      <h3>Decision follow-up</h3>
      {data.certification.history.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {data.canRecord && data.certification.offered ? (
        <details>
          <summary>Record a request to the selectmen</summary>
          <ActionForm action={certificationAction} submitLabel="Record" className="max-w-md">
            <input type="hidden" name="applicationId" value={data.applicationId} />
            <TextField
              label="Date requested"
              name="requestedOn"
              type="date"
              defaultValue={data.today}
              required
            />
            <SelectField
              label="Outcome"
              name="outcome"
              options={[
                ['pending', 'Requested, waiting'],
                ['certified', 'Certified by the selectmen'],
                ['refused', 'The selectmen refused'],
              ]}
            />
            <TextField label="Date decided, if certified" name="decidedOn" type="date" />
          </ActionForm>
        </details>
      ) : null}
      {exercise ? (
        <>
          <p>
            {data.exerciseText === null
              ? 'The deadline to exercise the approval starts when final approval is recorded.'
              : `The approval must be exercised by ${data.exerciseText}.`}
          </p>
          {data.canRecord &&
          data.exerciseText === null &&
          AWAITING_FINAL_APPROVAL.includes(data.state) ? (
            <ActionForm
              action={finalApprovalAction}
              submitLabel="Record final approval"
              className="max-w-md"
            >
              <input type="hidden" name="applicationId" value={data.applicationId} />
              <TextField
                label="Date of final approval"
                name="finalOn"
                type="date"
                defaultValue={data.today}
                required
              />
            </ActionForm>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
