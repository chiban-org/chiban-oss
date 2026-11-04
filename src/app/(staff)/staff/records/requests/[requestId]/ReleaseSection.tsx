import { ActionForm } from '@/components/ActionForm'
import { NEW_TAB } from '@/components/newTab'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import { RTK_METHOD_LABELS } from '@/features/rtk/labels'
import type { ReleaseCandidate, ReleaseSummary, RequestApproval } from '@/features/rtk/requestPage'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { approveRenditionAction, revokeApprovalAction } from '../../renditionActions'
import { createReleaseAction } from '../actions'
import { type FindContext, ReleaseFind } from './ReleaseFind'

const ROLE_LABELS: Record<string, string> = {
  original: 'Original',
  public_redacted: 'Redacted copy for the public',
  release_redacted: 'Redacted copy for this request',
}

function versionLabel(title: string, v: ReleaseCandidate['versions'][number]): string {
  const day = formatCivilDate(v.createdAt.slice(0, 10))
  const time = v.role === 'original' ? '' : ` ${v.createdAt.slice(11, 16)} UTC`
  return `${title}: ${ROLE_LABELS[v.role] ?? v.role}, ${day}${time}`
}

function Hidden({ name, value }: { name: string; value: string | number }) {
  return <input type="hidden" name={name} value={String(value)} />
}

interface Props {
  find: FindContext
  releases: ReleaseSummary[]
  approvals: RequestApproval[]
  candidates: ReleaseCandidate[]
  today: CivilDate
  canManage: boolean
  working: boolean
}

function ReleaseList({ releases }: { releases: ReleaseSummary[] }) {
  if (releases.length === 0) return <p>Nothing has been released yet.</p>
  return (
    <ul className="m-0 list-none space-y-3 p-0">
      {releases.map((r) => (
        <li key={r.id} className="record-item">
          <p className="m-0 font-medium">
            {`Release ${r.sequence}, ${formatCivilDate(r.releasedOn)}, ${RTK_METHOD_LABELS[r.method]}`}
          </p>
          <ul className="m-0 list-none p-0">
            {r.items.map((i) => (
              <li key={`${r.id}-${i.title}`}>{`${i.title}${i.withdrawn ? ' (withdrawn)' : ''}`}</li>
            ))}
          </ul>
          {r.letterDocumentId === null ? null : (
            <a {...NEW_TAB} href={`/api/documents/${r.letterDocumentId}`}>
              Letter for this release
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

function ApprovalList({
  approvals,
  canManage,
}: {
  approvals: RequestApproval[]
  canManage: boolean
}) {
  if (approvals.length === 0) return null
  return (
    <>
      <h3>Approved for release</h3>
      <ul className="m-0 list-none space-y-3 p-0">
        {approvals.map((a) => (
          <li key={a.approvalId} className="record-item">
            <p className="m-0">
              {`${a.title}: ${ROLE_LABELS[a.role] ?? a.role}${a.revokedAt === null ? '' : ' (revoked)'}`}
            </p>
            {canManage && a.revokedAt === null ? (
              <details>
                <summary>Revoke approval</summary>
                <ActionForm
                  action={revokeApprovalAction}
                  submitLabel="Revoke approval"
                  confirm={{
                    title: 'Revoke this approval?',
                    body: 'The approved version can no longer be released for this request until someone approves it again.',
                    confirmLabel: 'Revoke the approval',
                  }}
                >
                  <Hidden name="approvalId" value={a.approvalId} />
                  <TextField label="Why it is being revoked" name="reason" required />
                </ActionForm>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}

function ApproveForm({ find, candidates }: { find: FindContext; candidates: ReleaseCandidate[] }) {
  const options: [string, string][] = candidates.flatMap((c) =>
    c.versions.map((v) => [v.id, versionLabel(`${c.title}, ${c.context}`, v)] as [string, string]),
  )
  const searched = find.find.trim() !== ''
  return (
    <details open={searched}>
      <summary>Approve a version for release</summary>
      <ReleaseFind {...find} />
      {options.length === 0 ? (
        <p>
          {searched
            ? 'No document matches. Try part of its title or the application or case number.'
            : 'Search for the document to release, then pick the version.'}
        </p>
      ) : (
        <ActionForm action={approveRenditionAction} submitLabel="Approve for release">
          <Hidden name="purpose" value="rtk_release" />
          <Hidden name="rtkRequestId" value={find.requestId} />
          <SelectField label="Document and version" name="versionId" options={options} />
          <TextField label="What you checked before approving" name="reviewStatement" required />
        </ActionForm>
      )}
    </details>
  )
}

function ReleaseForm({
  requestId,
  active,
  today,
}: {
  requestId: string
  active: RequestApproval[]
  today: CivilDate
}) {
  return (
    <details>
      <summary>Release approved records</summary>
      <ActionForm
        action={createReleaseAction}
        submitLabel="Release"
        confirm={{
          title: 'Release these records?',
          body: 'The chosen records are sent to the requester. Once released they cannot be called back.',
          confirmLabel: 'Release the records',
        }}
      >
        <Hidden name="requestId" value={requestId} />
        <fieldset className="space-y-2 border-0 p-0">
          <legend className="text-sm font-medium">Records in this release</legend>
          {active.map((a) => (
            <CheckField
              key={a.approvalId}
              label={`${a.title}: ${ROLE_LABELS[a.role] ?? a.role}`}
              name="items"
              value={`${a.documentId}:${a.approvalId}`}
            />
          ))}
        </fieldset>
        <TextField
          label="Date released"
          name="releasedOn"
          type="date"
          defaultValue={today}
          required
        />
        <SelectField label="How" name="method" options={Object.entries(RTK_METHOD_LABELS)} />
        <TextField label="Email address, for a link" name="recipientEmail" type="email" />
      </ActionForm>
    </details>
  )
}

export function ReleaseSection(props: Props) {
  const { find, releases, approvals, candidates, today, canManage, working } = props
  const active = approvals.filter((a) => a.revokedAt === null)
  return (
    <section aria-labelledby="releases">
      <h2 id="releases">Releases</h2>
      <ReleaseList releases={releases} />
      <ApprovalList approvals={approvals} canManage={canManage} />
      {working ? <ApproveForm find={find} candidates={candidates} /> : null}
      {working && active.length > 0 ? (
        <ReleaseForm requestId={find.requestId} active={active} today={today} />
      ) : null}
    </section>
  )
}
