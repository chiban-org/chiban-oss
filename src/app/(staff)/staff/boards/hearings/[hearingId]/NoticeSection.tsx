import {
  createStaffUploadIntentAction,
  finalizeStaffUploadAction,
} from '@/app/(staff)/staff/records/uploadActions'
import { ActionForm } from '@/components/ActionForm'
import { ApplicationFileUploader } from '@/components/documents/ApplicationFileUploader'
import { NEW_TAB } from '@/components/newTab'
import { NoticeChecklist } from '@/components/notices/NoticeChecklist'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import type { HearingView } from '@/features/hearings/views'
import { PROOF_METHOD_LABELS, PROOF_METHODS } from '@/features/notices/proofMethods'
import { recordProofAction } from '../actions'

function ProofForm({ view, today }: { view: HearingView; today: string }) {
  return (
    <details id="record-proof">
      <summary>Record proof of notice</summary>
      <ApplicationFileUploader
        applicationId={view.applicationId}
        fileLabel="Upload a certificate or receipt"
        actions={{
          createIntent: createStaffUploadIntentAction,
          finalize: finalizeStaffUploadAction,
        }}
      />
      <ActionForm action={recordProofAction} submitLabel="Record proof" className="max-w-xl">
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Notice items this proof covers</legend>
          {view.itemChoices.map((c) => (
            <CheckField key={c.id} label={c.label} name="itemIds" value={c.id} />
          ))}
        </fieldset>
        <SelectField
          label="Proof"
          name="method"
          options={PROOF_METHODS.map((m): [string, string] => [m, PROOF_METHOD_LABELS[m]])}
        />
        <TextField
          label="Tracking number"
          name="reference"
          hint="Needed for certified mail and other carriers."
        />
        <TextField
          label="Date of mailing, posting, or publication"
          name="effectiveOn"
          type="date"
          defaultValue={today}
          required
        />
        <SelectField
          label="Certificate or receipt"
          name="documentId"
          defaultValue=""
          required
          options={[
            ['', 'Choose an uploaded file'],
            ...view.documentChoices.map((d): [string, string] => [d.id, d.label]),
          ]}
        />
      </ActionForm>
    </details>
  )
}

export function NoticeSection({ view, today }: { view: HearingView; today: string }) {
  return (
    <section aria-labelledby="notice">
      <h2 id="notice">Notice</h2>
      <NoticeChecklist items={view.checklist} noticedOn={view.noticedOn} />
      <p>
        <a {...NEW_TAB} href={`/staff/boards/hearings/${view.hearingId}/letters`}>
          Print the notice letters
        </a>
      </p>
      {view.status === 'scheduled' ? <ProofForm view={view} today={today} /> : null}
    </section>
  )
}
