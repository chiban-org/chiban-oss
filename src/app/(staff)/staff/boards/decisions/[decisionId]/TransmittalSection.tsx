import { ActionForm } from '@/components/ActionForm'
import { ApplicationFileUploader } from '@/components/documents/ApplicationFileUploader'
import { GroupFieldError } from '@/components/fieldErrors'
import { NoticeChecklist } from '@/components/notices/NoticeChecklist'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import type { DecisionView } from '@/features/decisions/decisionView'
import { PROOF_METHOD_LABELS, type ProofMethod } from '@/features/notices/proofMethods'
import { recordProofAction } from '../../hearings/actions'
import { transmittalAction } from '../../hearings/decisionActions'
import { UPLOAD_ACTIONS } from './uploads'

const TRANSMITTAL_METHODS: ProofMethod[] = ['certified_mail']

function ProofForm({
  view,
  transmittal,
  today,
}: {
  view: DecisionView
  transmittal: NonNullable<DecisionView['transmittal']>
  today: string
}) {
  return (
    <details id="record-transmittal">
      <summary>Record proof of transmittal</summary>
      <ApplicationFileUploader
        applicationId={view.applicationId}
        fileLabel="Upload a certified mail receipt"
        actions={UPLOAD_ACTIONS}
      />
      <ActionForm action={recordProofAction} submitLabel="Record proof" className="max-w-xl">
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Recipients this proof covers</legend>
          {transmittal.itemChoices.map((c) => (
            <CheckField key={c.id} label={c.label} name="itemIds" value={c.id} groupMember />
          ))}
          <GroupFieldError name="itemIds" />
        </fieldset>
        <SelectField
          label="Proof"
          name="method"
          options={TRANSMITTAL_METHODS.map((m): [string, string] => [m, PROOF_METHOD_LABELS[m]])}
        />
        <TextField label="Tracking number" name="reference" />
        <TextField
          label="Date mailed"
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
            ...view.proofChoices.map((d): [string, string] => [d.id, d.label]),
          ]}
        />
      </ActionForm>
    </details>
  )
}

export function TransmittalSection({ view, today }: { view: DecisionView; today: string }) {
  const { transmittal } = view
  return (
    <section aria-labelledby="transmittal">
      <h2 id="transmittal">Regional transmittal</h2>
      <p>
        Within 5 business days after the decision, send copies of the minutes of the decision
        meeting by certified mail to the regional planning commission and each affected
        municipality. At the same time, send the initial set of plans to the regional planning
        commission only, at the applicant&apos;s cost (RSA 36:57 II).
      </p>
      <ActionForm
        action={transmittalAction}
        submitLabel={
          view.transmittalStarted ? 'Check the transmittal' : 'Start the transmittal checklist'
        }
      >
        <input type="hidden" name="decisionId" value={view.decisionId} />
      </ActionForm>
      {transmittal === null ? null : (
        <>
          <NoticeChecklist items={transmittal.checklist} noticedOn={null} />
          <ProofForm view={view} transmittal={transmittal} today={today} />
        </>
      )}
    </section>
  )
}
