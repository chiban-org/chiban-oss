import { ActionForm } from '@/components/ActionForm'
import { ApplicationFileUploader } from '@/components/documents/ApplicationFileUploader'
import { SelectField, TextField } from '@/components/staff/fields'
import type { DecisionView } from '@/features/decisions/decisionView'
import { recordFinalApprovalAction, recordRegistryAction } from '../../hearings/decisionActions'
import { UPLOAD_ACTIONS } from './uploads'

const APPROVAL_DATE_HINT = 'The date the board signed or issued its written decision.'

function approvalDateHint(period: string | null): string {
  if (period === null) return APPROVAL_DATE_HINT
  return `${APPROVAL_DATE_HINT} The certificate must be recorded within ${period} of this date or the variance is void.`
}

function ApprovalForm({ view, today }: { view: DecisionView; today: string }) {
  return (
    <ActionForm
      action={recordFinalApprovalAction}
      submitLabel="Record the final written approval"
      variant="default"
      className="max-w-md"
    >
      <input type="hidden" name="decisionId" value={view.decisionId} />
      <TextField
        label="Date of the final written approval"
        name="approvedOn"
        type="date"
        hint={approvalDateHint(view.recordingPeriod)}
        defaultValue={today}
        min={view.votedOn}
        max={today}
        required
      />
    </ActionForm>
  )
}

function RegistryForm({
  view,
  recording,
  today,
}: {
  view: DecisionView
  recording: NonNullable<DecisionView['recording']>
  today: string
}) {
  return (
    <>
      <ApplicationFileUploader
        applicationId={view.applicationId}
        fileLabel="Upload the recorded certificate"
        actions={UPLOAD_ACTIONS}
      />
      <ActionForm
        action={recordRegistryAction}
        submitLabel="Record at the registry"
        variant="default"
        className="max-w-md"
      >
        <input type="hidden" name="decisionId" value={view.decisionId} />
        <TextField label="Registry of deeds" name="registry" required />
        <TextField label="Book" name="book" required />
        <TextField label="Page" name="page" required />
        <TextField
          label="Date recorded"
          name="recordedOn"
          type="date"
          defaultValue={today}
          min={recording.approvedOn ?? view.votedOn}
          max={today}
          required
        />
        <SelectField
          label="Recorded certificate"
          name="certificateDocumentId"
          defaultValue=""
          required
          options={[
            ['', 'Choose the certificate'],
            ...recording.certificateChoices.map((d): [string, string] => [d.id, d.label]),
          ]}
        />
      </ActionForm>
    </>
  )
}

function Status({ recording }: { recording: NonNullable<DecisionView['recording']> }) {
  if (recording.recordedText !== null) return <p>{`Recorded at ${recording.recordedText}.`}</p>
  if (recording.voidDueText === null) return null
  return (
    <p>
      {recording.voidLapsed
        ? `The period for recording ended ${recording.voidDueText}. A recording dated on or before that day still counts.`
        : `The certificate must be recorded by ${recording.voidDueText}.`}
    </p>
  )
}

export function RecordingSection({ view, today }: { view: DecisionView; today: string }) {
  const recording = view.recording
  if (recording === null) return null
  return (
    <section aria-labelledby="recording">
      <h2 id="recording">Registry recording</h2>
      {recording.approvedText === null ? (
        <ApprovalForm view={view} today={today} />
      ) : (
        <p>{`Final written approval ${recording.approvedText}.`}</p>
      )}
      <Status recording={recording} />
      {recording.approvedText !== null && recording.recordedText === null ? (
        <RegistryForm view={view} recording={recording} today={today} />
      ) : null}
    </section>
  )
}
