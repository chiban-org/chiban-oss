import { ActionForm } from '@/components/ActionForm'
import { ApplicationFileUploader } from '@/components/documents/ApplicationFileUploader'
import { SelectField, TextField } from '@/components/staff/fields'
import type { DecisionView } from '@/features/decisions/decisionView'
import { fileDecisionAction } from '../../hearings/decisionActions'
import { UPLOAD_ACTIONS } from './uploads'

function FileForm({ view, today }: { view: DecisionView; today: string }) {
  return (
    <ActionForm
      action={fileDecisionAction}
      submitLabel="File the decision"
      variant="default"
      className="max-w-md"
    >
      <input type="hidden" name="decisionId" value={view.decisionId} />
      <TextField
        label="Date filed"
        name="filedOn"
        type="date"
        defaultValue={today}
        min={view.votedOn}
        max={today}
        required
      />
      <SelectField
        label="Minutes"
        name="minutesDocumentId"
        defaultValue=""
        required
        options={[
          ['', 'Choose the minutes'],
          ...view.minutesChoices.map((d): [string, string] => [d.id, d.label]),
        ]}
      />
    </ActionForm>
  )
}

export function FilingSection({ view, today }: { view: DecisionView; today: string }) {
  if (view.filedText !== null) {
    return (
      <section aria-labelledby="file-decision">
        <h2 id="file-decision">Filing</h2>
        <p>{`Filed ${view.filedText}. The decision and minutes are public.`}</p>
      </section>
    )
  }
  return (
    <section aria-labelledby="file-decision" className="space-y-4">
      <h2 id="file-decision">Filing</h2>
      <ApplicationFileUploader
        applicationId={view.applicationId}
        fileLabel="Upload the minutes"
        actions={UPLOAD_ACTIONS}
      />
      {view.documentsGenerated ? <FileForm view={view} today={today} /> : null}
    </section>
  )
}
