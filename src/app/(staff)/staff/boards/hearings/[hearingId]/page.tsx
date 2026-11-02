import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  createStaffUploadIntentAction,
  finalizeStaffUploadAction,
} from '@/app/(staff)/staff/records/actions'
import { ActionForm } from '@/components/ActionForm'
import { ApplicationFileUploader } from '@/components/documents/ApplicationFileUploader'
import { NoticeChecklist } from '@/components/notices/NoticeChecklist'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { loadHearingView } from '@/features/hearings/views'
import { PROOF_METHOD_LABELS, PROOF_METHODS } from '@/features/notices/proofMethods'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import {
  continueHearingAction,
  markHeldAction,
  markProperlyNoticedAction,
  recordProofAction,
} from '../actions'
import { recordDecisionAction } from '../decisionActions'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OUTCOMES: [string, string][] = [
  ['approved', 'Approved'],
  ['approved_with_conditions', 'Approved with conditions'],
  ['denied', 'Denied'],
]

export default async function HearingPage({ params }: { params: Promise<{ hearingId: string }> }) {
  const { hearingId } = await params
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'board.record', ctx.signal))) {
    return <NoPermission title="Hearing" action="work with hearings" />
  }
  if (!UUID.test(hearingId)) notFound()
  const view = await loadHearingView(ctx.db, ctx.actor, hearingId, ctx.signal)
  if (view === null) notFound()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const scheduled = view.status === 'scheduled'
  return (
    <main className="space-y-6">
      <p>
        <Link href={`/staff/boards/meetings/${view.meetingId}`} className="text-action underline">
          {`${view.boardName}, ${view.meetingText}`}
        </Link>
      </p>
      <h1>{`${view.kindText}: ${view.typeLabel} ${view.applicationNumber}`}</h1>
      <p>
        {`${view.statusText}. `}
        <Link href={`/staff/applications/${view.applicationId}`} className="text-action underline">
          Open the application
        </Link>
      </p>
      {view.continuationText === null ? null : <p>{view.continuationText}</p>}
      <h2>Notice</h2>
      <NoticeChecklist
        items={view.checklist}
        noticedOn={view.noticedOn}
        markSlot={
          scheduled ? (
            <ActionForm
              action={markProperlyNoticedAction}
              submitLabel="Mark properly noticed"
              variant="default"
            >
              <input type="hidden" name="hearingId" value={view.hearingId} />
            </ActionForm>
          ) : null
        }
      />
      <p>
        <a
          href={`/staff/boards/hearings/${view.hearingId}/letters`}
          className="text-action underline"
        >
          Print the notice letters
        </a>
      </p>
      {scheduled ? (
        <details>
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
            <fieldset className="space-y-1 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">Notice items this proof covers</legend>
              {view.itemChoices.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="itemIds" value={c.id} />
                  {c.label}
                </label>
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
      ) : null}
      {scheduled ? (
        <details>
          <summary>Continue the hearing to another meeting</summary>
          <ActionForm
            action={continueHearingAction}
            submitLabel="Continue hearing"
            className="max-w-xl"
          >
            <input type="hidden" name="hearingId" value={view.hearingId} />
            <SelectField
              label="New meeting"
              name="toMeetingId"
              options={view.otherMeetings.map((m): [string, string] => [m.id, m.text])}
            />
            <SelectField
              label="Was the new date, time, and place announced at the meeting?"
              name="announced"
              options={[
                ['yes', 'Yes, it was announced'],
                ['no', 'No, it was not announced'],
              ]}
            />
            <AreaField
              label="What was announced"
              name="details"
              hint="Required when it was announced."
            />
          </ActionForm>
        </details>
      ) : null}
      {scheduled && view.properlyNoticed && view.noticedOn !== null ? (
        <ActionForm
          action={markHeldAction}
          submitLabel="Mark the hearing held"
          variant="default"
          className="max-w-md"
        >
          <input type="hidden" name="hearingId" value={view.hearingId} />
          <TextField
            label="Date held"
            name="heldOn"
            type="date"
            defaultValue={view.defaultHeldOn}
            min={view.defaultHeldOn}
            required
          />
        </ActionForm>
      ) : null}
      {view.status === 'held' && view.decision === null ? (
        <section className="space-y-3">
          <h2>Record the decision</h2>
          <ActionForm
            action={recordDecisionAction}
            submitLabel="Record decision"
            variant="default"
            className="max-w-2xl"
          >
            <input type="hidden" name="applicationId" value={view.applicationId} />
            <input type="hidden" name="hearingId" value={view.hearingId} />
            <TextField
              label="Date of the vote"
              name="votedOn"
              type="date"
              defaultValue={view.defaultVotedOn}
              min={view.defaultVotedOn}
              required
            />
            <SelectField label="Outcome" name="outcome" options={OUTCOMES} />
            <TextField label="Motion" name="motion" required />
            <AreaField
              label="How each member voted"
              name="votes"
              required
              hint="One member per line, for example: Avery Stone: for. Use for, against, abstain, or recused."
            />
            <AreaField label="Findings of fact" name="findings" required />
            <AreaField
              label="Conditions"
              name="conditions"
              hint="One per line. Start a line with Before issuance: if it must be met first."
            />
            <AreaField
              label="Reasons for disapproval"
              name="reasons"
              hint="Required when denied."
            />
          </ActionForm>
        </section>
      ) : null}
      {view.decision === null ? null : (
        <p>
          {`Decision: ${view.decision.text}. `}
          <Link
            href={`/staff/boards/decisions/${view.decision.decisionId}`}
            className="text-action underline"
          >
            Open the decision
          </Link>
        </p>
      )}
    </main>
  )
}
