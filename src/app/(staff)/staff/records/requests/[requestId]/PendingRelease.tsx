import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { RTK_METHOD_LABELS } from '@/features/rtk/labels'
import { releaseLetterNoteFor, requesterEmailOf } from '@/features/rtk/requesterEmail'
import type { RequestApproval } from '@/features/rtk/requestPage'
import { formatInstantDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { createReleaseAction } from '../actions'
import { versionLabel } from './versionLabels'

function releaseLabel(count: number): string {
  return count === 1 ? 'Release 1 record' : `Release ${count} records`
}

function byDocument(pending: readonly RequestApproval[]): RequestApproval[][] {
  const groups = new Map<string, RequestApproval[]>()
  for (const a of pending) groups.set(a.documentId, [...(groups.get(a.documentId) ?? []), a])
  return [...groups.values()]
}

function itemValue(a: RequestApproval): string {
  return `${a.documentId}:${a.approvalId}`
}

function newest(versions: readonly RequestApproval[]): RequestApproval | undefined {
  return versions.reduce<RequestApproval | undefined>(
    (best, a) => (best === undefined || a.approvedAt > best.approvedAt ? a : best),
    undefined,
  )
}

function DocumentItem({
  versions,
  timeZone,
}: {
  versions: readonly RequestApproval[]
  timeZone: string
}) {
  const [only] = versions
  if (only === undefined) return null
  if (versions.length === 1) return <input type="hidden" name="items" value={itemValue(only)} />
  const chosen = newest(versions)
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 font-medium">{`Which version of ${only.title} to release`}</legend>
      {versions.map((a) => (
        <label key={a.approvalId} className="flex items-start gap-2">
          <input
            type="radio"
            name="items"
            value={itemValue(a)}
            defaultChecked={a === chosen}
            className="mt-1 size-4 shrink-0 accent-action"
          />
          <span>{versionLabel(a.role, a.versionCreatedAt, timeZone)}</span>
        </label>
      ))}
    </fieldset>
  )
}

export function PendingRelease({
  requestId,
  pending,
  today,
  timeZone,
  requesterContact,
}: {
  requestId: string
  pending: readonly RequestApproval[]
  today: CivilDate
  timeZone: string
  requesterContact: string | null
}) {
  if (pending.length === 0) return null
  return (
    <section aria-label="Approved, not yet released" data-slot="pending-release">
      <h3>Approved, not yet released</h3>
      <ul className="list-none p-0">
        {pending.map((a) => (
          <li key={a.approvalId} className="record-item">
            <p className="m-0 font-medium">{a.title}</p>
            <p className="m-0 text-sm text-ink-secondary">
              {`${versionLabel(a.role, a.versionCreatedAt, timeZone)}. Approved ${formatInstantDate(a.approvedAt, timeZone)}.`}
            </p>
          </li>
        ))}
      </ul>
      <ActionForm
        action={createReleaseAction}
        submitLabel={releaseLabel(byDocument(pending).length)}
        variant="default"
        submitNote={releaseLetterNoteFor(requesterContact)}
        confirm={{
          title: 'Release these records?',
          body: 'The approved records are sent to the requester. Once released they cannot be called back.',
          confirmLabel: 'Release the records',
        }}
      >
        <input type="hidden" name="requestId" value={requestId} />
        {byDocument(pending).map((versions) => (
          <DocumentItem key={versions[0]?.documentId} versions={versions} timeZone={timeZone} />
        ))}
        <TextField
          label="Date released"
          name="releasedOn"
          type="date"
          defaultValue={today}
          required
        />
        <SelectField label="How" name="method" options={Object.entries(RTK_METHOD_LABELS)} />
        <TextField
          label="Requester's email address"
          name="recipientEmail"
          type="email"
          defaultValue={requesterEmailOf(requesterContact) ?? ''}
          hint="Needed when the records go by email, as a link or as attachments."
        />
      </ActionForm>
    </section>
  )
}
