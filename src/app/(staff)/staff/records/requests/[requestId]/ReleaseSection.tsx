import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { RTK_METHOD_LABELS } from '@/features/rtk/labels'
import type { ReleaseCandidate, ReleaseSummary, RequestApproval } from '@/features/rtk/requestPage'
import type { RtkRequestView } from '@/features/rtk/requests'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { approveRenditionAction, revokeApprovalAction } from '../../renditionActions'
import { createReleaseAction } from '../actions'

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
  request: RtkRequestView
  releases: ReleaseSummary[]
  approvals: RequestApproval[]
  candidates: ReleaseCandidate[]
  today: CivilDate
}

export function ReleaseSection({ request, releases, approvals, candidates, today }: Props) {
  const open = request.status !== 'closed' && request.status !== 'withdrawn'
  const active = approvals.filter((a) => a.revokedAt === null)
  const versionOptions: [string, string][] = candidates.flatMap((c) =>
    c.versions.map((v) => [v.id, versionLabel(c.title, v)] as [string, string]),
  )
  return (
    <section aria-labelledby="releases" className="space-y-3 border-t pt-4">
      <h2 id="releases">Releases</h2>
      {releases.length === 0 ? <p>Nothing has been released yet.</p> : null}
      {releases.map((r) => (
        <div key={r.id} className="rounded-md border p-3">
          <p className="m-0 font-medium">
            {`Release ${r.sequence}, ${formatCivilDate(r.releasedOn)}, ${RTK_METHOD_LABELS[r.method]}`}
          </p>
          <ul className="m-0 list-none p-0">
            {r.items.map((i) => (
              <li key={`${r.id}-${i.title}`}>{`${i.title}${i.withdrawn ? ' (withdrawn)' : ''}`}</li>
            ))}
          </ul>
          {r.letterDocumentId === null ? null : (
            <a href={`/api/documents/${r.letterDocumentId}`} className="text-action underline">
              Letter for this release
            </a>
          )}
        </div>
      ))}
      {approvals.length > 0 ? (
        <>
          <h3>Approved for release</h3>
          <ul className="m-0 list-none space-y-2 p-0">
            {approvals.map((a) => (
              <li key={a.approvalId} className="rounded-md border p-3">
                <p className="m-0">
                  {`${a.title}: ${ROLE_LABELS[a.role] ?? a.role}${a.revokedAt === null ? '' : ' (revoked)'}`}
                </p>
                {a.revokedAt === null ? (
                  <ActionForm action={revokeApprovalAction} submitLabel="Revoke approval">
                    <Hidden name="approvalId" value={a.approvalId} />
                    <TextField label="Why it is being revoked" name="reason" required />
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {open ? (
        <>
          <h3>Approve a version for this request</h3>
          <ActionForm action={approveRenditionAction} submitLabel="Approve for release">
            <Hidden name="purpose" value="rtk_release" />
            <Hidden name="rtkRequestId" value={request.id} />
            <SelectField label="Document and version" name="versionId" options={versionOptions} />
            <TextField label="What you checked before approving" name="reviewStatement" required />
          </ActionForm>
          <h3>Release approved records</h3>
          {active.length === 0 ? (
            <p>Approve at least one version first.</p>
          ) : (
            <ActionForm action={createReleaseAction} submitLabel="Release">
              <Hidden name="requestId" value={request.id} />
              <fieldset className="space-y-1 border-0 p-0">
                <legend className="text-sm font-medium">Records in this release</legend>
                {active.map((a) => (
                  <label key={a.approvalId} className="flex items-center gap-2">
                    <input type="checkbox" name="items" value={`${a.documentId}:${a.approvalId}`} />
                    {`${a.title}: ${ROLE_LABELS[a.role] ?? a.role}`}
                  </label>
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
          )}
        </>
      ) : null}
    </section>
  )
}
