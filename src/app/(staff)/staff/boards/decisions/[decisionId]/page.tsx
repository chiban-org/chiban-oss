import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  createStaffUploadIntentAction,
  finalizeStaffUploadAction,
} from '@/app/(staff)/staff/records/actions'
import { ActionForm } from '@/components/ActionForm'
import { AppealGraph } from '@/components/appeals/AppealGraph'
import { ApplicationFileUploader } from '@/components/documents/ApplicationFileUploader'
import { NoticeChecklist } from '@/components/notices/NoticeChecklist'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { loadDecisionView } from '@/features/decisions/decisionView'
import { PROOF_METHOD_LABELS, type ProofMethod } from '@/features/notices/proofMethods'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { recordProofAction } from '../../hearings/actions'
import {
  addAppealNodeAction,
  fileDecisionAction,
  generateDecisionDocumentsAction,
  transmittalAction,
} from '../../hearings/decisionActions'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRANSMITTAL_METHODS: ProofMethod[] = ['certified_mail']
const UPLOAD_ACTIONS = {
  createIntent: createStaffUploadIntentAction,
  finalize: finalizeStaffUploadAction,
}
const APPEAL_STEPS: [string, string][] = [
  ['rehearing_motion', 'Motion for rehearing'],
  ['rehearing_outcome', 'Rehearing decision'],
  ['court_petition', 'Court petition'],
  ['zba_appeal', 'Appeal to the Zoning Board'],
  ['zba_decision', 'Zoning Board decision'],
]

export default async function DecisionPage({
  params,
}: {
  params: Promise<{ decisionId: string }>
}) {
  const { decisionId } = await params
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'board.record', ctx.signal))) {
    return <NoPermission title="Decision" action="work with board decisions" />
  }
  if (!UUID.test(decisionId)) notFound()
  const view = await loadDecisionView(ctx.db, ctx.actor, decisionId, ctx.signal)
  if (view === null) notFound()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  return (
    <main className="space-y-6">
      <p>
        <Link href={`/staff/applications/${view.applicationId}`} className="text-action underline">
          {`${view.typeLabel} ${view.applicationNumber}`}
        </Link>
      </p>
      <h1>{`${view.outcomeText}, voted ${view.votedOnText}`}</h1>
      <dl className="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium">Motion</dt>
        <dd>{view.motion}</dd>
        <dt className="font-medium">Vote</dt>
        <dd>{view.voteText}</dd>
        <dt className="font-medium">Findings of fact</dt>
        <dd>{view.findings}</dd>
        {view.conditions.length === 0 ? null : (
          <>
            <dt className="font-medium">Conditions</dt>
            <dd>
              {view.conditions
                .map((c) => (c.precedent ? `Before issuance: ${c.text}` : c.text))
                .join(' ')}
            </dd>
          </>
        )}
        {view.reasons === null ? null : (
          <>
            <dt className="font-medium">Reasons for disapproval</dt>
            <dd>{view.reasons}</dd>
          </>
        )}
      </dl>
      <h2>Notice of Decision</h2>
      {view.documentsGenerated ? (
        <p>The Notice of Decision and the decision letter are on the application.</p>
      ) : (
        <ActionForm
          action={generateDecisionDocumentsAction}
          submitLabel="Create the Notice of Decision and letter"
          variant="default"
        >
          <input type="hidden" name="decisionId" value={view.decisionId} />
        </ActionForm>
      )}
      <h2>Filing</h2>
      {view.filingDueText === null ? null : (
        <p>{`Minutes and the written decision are due ${view.filingDueText}.`}</p>
      )}
      {view.filedText === null ? (
        <ApplicationFileUploader
          applicationId={view.applicationId}
          fileLabel="Upload the minutes"
          actions={UPLOAD_ACTIONS}
        />
      ) : null}
      {view.filedText !== null ? (
        <p>{`Filed ${view.filedText}. The decision and minutes are public.`}</p>
      ) : view.documentsGenerated ? (
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
      ) : (
        <p>Create the Notice of Decision before filing.</p>
      )}
      {view.regional ? (
        <>
          <h2>Regional transmittal</h2>
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
        </>
      ) : null}
      {view.transmittal === null ? null : (
        <div className="space-y-3">
          <NoticeChecklist items={view.transmittal.checklist} noticedOn={null} showMark={false} />
          <details>
            <summary>Record proof of transmittal</summary>
            <ApplicationFileUploader
              applicationId={view.applicationId}
              fileLabel="Upload a certified mail receipt"
              actions={UPLOAD_ACTIONS}
            />
            <ActionForm action={recordProofAction} submitLabel="Record proof" className="max-w-xl">
              <fieldset className="space-y-1 rounded-md border p-3">
                <legend className="px-1 text-sm font-medium">Recipients this proof covers</legend>
                {view.transmittal.itemChoices.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="itemIds" value={c.id} />
                    {c.label}
                  </label>
                ))}
              </fieldset>
              <SelectField
                label="Proof"
                name="method"
                options={TRANSMITTAL_METHODS.map((m): [string, string] => [
                  m,
                  PROOF_METHOD_LABELS[m],
                ])}
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
        </div>
      )}
      <h2>Appeals</h2>
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
    </main>
  )
}
