import {
  createStaffUploadIntentAction,
  finalizeStaffUploadAction,
} from '@/app/(staff)/staff/records/uploadActions'
import { ActionForm } from '@/components/ActionForm'
import { ApplicationFileUploader } from '@/components/documents/ApplicationFileUploader'
import { GroupFieldError } from '@/components/fieldErrors'
import { NoticeChecklist } from '@/components/notices/NoticeChecklist'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import type { ReceiptPanel } from '@/features/boards/receiptPanel'
import { PROOF_METHOD_LABELS, PROOF_METHODS } from '@/features/notices/proofMethods'
import { recordProofAction } from '../../boards/hearings/actions'
import { prepareReceiptNoticesAction } from '../../boards/receiptActions'
import { MunicipalitiesForm, SourceWaterForm } from './receiptDeterminationForms'

function ProofForm({ data, today }: { data: ReceiptPanel; today: string }) {
  return (
    <details id="record-receipt-proof">
      <summary>Record proof of notice</summary>
      <ApplicationFileUploader
        applicationId={data.applicationId}
        fileLabel="Upload a certificate or receipt"
        actions={{
          createIntent: createStaffUploadIntentAction,
          finalize: finalizeStaffUploadAction,
        }}
      />
      <ActionForm action={recordProofAction} submitLabel="Record proof" className="max-w-xl">
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Notice items this proof covers</legend>
          {data.itemChoices.map((c) => (
            <CheckField key={c.id} label={c.label} name="itemIds" value={c.id} groupMember />
          ))}
          <GroupFieldError name="itemIds" />
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
            ...data.proofChoices.map((d): [string, string] => [d.id, d.label]),
          ]}
        />
      </ActionForm>
    </details>
  )
}

export function ReceiptSection({ data, today }: { data: ReceiptPanel; today: string }) {
  return (
    <section aria-label="Notices on receipt">
      <h3>Notices on receipt</h3>
      <p>
        Notice is due after the application is received, before any hearing. Issue the abutter list,
        then prepare the notices.
      </p>
      <p>{data.sourceWater.text}</p>
      <p>{data.municipalities.text}</p>
      {data.canDetermine ? (
        <>
          <details>
            <summary>Record the source water protection area determination</summary>
            <SourceWaterForm data={data} />
          </details>
          <details>
            <summary>Record the abutting or included municipalities</summary>
            <MunicipalitiesForm data={data} />
          </details>
        </>
      ) : null}
      {data.outOfDate ? (
        <p>
          The abutter list was issued again after these notices were prepared. Prepare them again
          from the new list; the notices below and their proofs stay on the record.
        </p>
      ) : null}
      {data.canPrepare ? (
        <ActionForm
          action={prepareReceiptNoticesAction}
          submitLabel={data.prepared ? 'Prepare receipt notices again' : 'Prepare receipt notices'}
        >
          <input type="hidden" name="applicationId" value={data.applicationId} />
        </ActionForm>
      ) : null}
      {data.prepared ? (
        <>
          <NoticeChecklist items={data.checklist} noticedOn={null} />
          <ProofForm data={data} today={today} />
        </>
      ) : null}
    </section>
  )
}
