import type { ReactNode } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { NEW_TAB } from '@/components/newTab'
import { TextField } from '@/components/staff/fields'
import { RTK_METHOD_LABELS } from '@/features/rtk/labels'
import type { ReleaseSummary, RequestApproval } from '@/features/rtk/requestPage'
import { formatCivilDate } from '@/lib/formatDate'
import { revokeApprovalAction } from '../../renditionActions'
import { roleLabel } from './versionLabels'

function ReleaseRow({ release }: { release: ReleaseSummary }) {
  return (
    <li className="record-item flex flex-col gap-1">
      <p className="m-0 font-medium">
        {`Release ${release.sequence}, ${formatCivilDate(release.releasedOn)}, ${RTK_METHOD_LABELS[release.method]}`}
      </p>
      <ul className="m-0 list-none p-0">
        {release.items.map((i) => (
          <li
            key={`${release.id}-${i.title}`}
          >{`${i.title}${i.withdrawn ? ' (withdrawn)' : ''}`}</li>
        ))}
      </ul>
      {release.letterDocumentId === null ? null : (
        <a {...NEW_TAB} href={`/api/documents/${release.letterDocumentId}`} className="self-start">
          {`Letter for release ${release.sequence}`}
        </a>
      )}
    </li>
  )
}

function approvalState(a: RequestApproval): string {
  if (a.revokedAt !== null) return 'Revoked'
  return a.releasedIn === null ? 'Waiting' : `Released in release ${a.releasedIn}`
}

function RevokeForm({ approval }: { approval: RequestApproval }) {
  return (
    <details>
      <summary className="text-sm">Revoke approval</summary>
      <ActionForm
        action={revokeApprovalAction}
        submitLabel="Revoke approval"
        confirm={{
          title: 'Revoke this approval?',
          body: 'The approved version can no longer be released for this request until someone approves it again.',
          confirmLabel: 'Revoke the approval',
        }}
      >
        <input type="hidden" name="approvalId" value={approval.approvalId} />
        <TextField label="Why it is being revoked" name="reason" required />
      </ActionForm>
    </details>
  )
}

function ApprovalRow({ approval, canManage }: { approval: RequestApproval; canManage: boolean }) {
  return (
    <li className="record-item flex flex-col gap-1">
      <p className="m-0">{`${approval.title}: ${roleLabel(approval.role)}`}</p>
      <p className="m-0 text-sm text-ink-secondary">{approvalState(approval)}</p>
      {canManage && approval.revokedAt === null ? <RevokeForm approval={approval} /> : null}
    </li>
  )
}

export function releasesEmpty(
  releases: readonly ReleaseSummary[],
  approvals: readonly RequestApproval[],
): boolean {
  return releases.length === 0 && approvals.length === 0
}

export function ReleaseSection({
  releases,
  approvals,
  canManage,
  findTool,
}: {
  releases: readonly ReleaseSummary[]
  approvals: readonly RequestApproval[]
  canManage: boolean
  findTool: ReactNode
}) {
  return (
    <section aria-labelledby="releases">
      <h2 id="releases">Releases</h2>
      {releases.length === 0 ? (
        <p className="text-muted-foreground">Nothing has been released yet.</p>
      ) : (
        <ul aria-label="Releases made" className="list-none p-0">
          {releases.map((r) => (
            <ReleaseRow key={r.id} release={r} />
          ))}
        </ul>
      )}
      {approvals.length === 0 ? null : (
        <>
          <h3>Approved for this request</h3>
          <ul aria-label="Approved for this request" className="list-none p-0">
            {approvals.map((a) => (
              <ApprovalRow key={a.approvalId} approval={a} canManage={canManage} />
            ))}
          </ul>
        </>
      )}
      {findTool}
    </section>
  )
}
