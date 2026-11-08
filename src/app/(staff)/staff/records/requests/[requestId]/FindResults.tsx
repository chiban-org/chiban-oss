import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import type { ReleaseCandidate } from '@/features/rtk/requestPage'
import { approveRenditionAction } from '../../renditionActions'
import type { FindContext } from './ReleaseFind'
import { versionLabel } from './versionLabels'

type Version = ReleaseCandidate['versions'][number]

function ApproveVersion({
  context,
  candidate,
  version,
}: {
  context: FindContext
  candidate: ReleaseCandidate
  version: Version
}) {
  const label = versionLabel(version.role, new Date(version.createdAt), context.timeZone)
  return (
    <li className="record-item flex flex-col gap-2">
      <p className="m-0 font-medium">{label}</p>
      <ActionForm
        action={approveRenditionAction}
        submitLabel="Approve"
        submitAccessibleLabel={`Approve ${candidate.title}: ${label}`}
        compact
        className="flex flex-col gap-2"
      >
        <input type="hidden" name="purpose" value="rtk_release" />
        <input type="hidden" name="rtkRequestId" value={context.requestId} />
        <input type="hidden" name="versionId" value={version.id} />
        <TextField label="What you checked before approving" name="reviewStatement" required />
      </ActionForm>
    </li>
  )
}

function RedactLink({ context, candidate }: { context: FindContext; candidate: ReleaseCandidate }) {
  if (!context.canRedact || candidate.originalVersionId === null) return null
  return (
    <a
      href={`/staff/records/redact/${candidate.originalVersionId}?request=${context.requestId}`}
      className="self-start"
    >
      Redact for this request
    </a>
  )
}

export function FindResults({
  context,
  candidates,
}: {
  context: FindContext
  candidates: readonly ReleaseCandidate[]
}) {
  if (candidates.length === 0) return null
  return (
    <ul aria-label="Documents found" className="m-0 flex list-none flex-col p-0">
      {candidates.map((c) => (
        <li key={c.documentId} className="record-item flex flex-col gap-2">
          <p className="m-0 font-semibold">{c.title}</p>
          <p className="m-0 text-sm text-ink-secondary">{c.context}</p>
          <RedactLink context={context} candidate={c} />
          <ul aria-label={`Versions of ${c.title}`} className="m-0 list-none pl-4">
            {c.versions.map((v) => (
              <ApproveVersion key={v.id} context={context} candidate={c} version={v} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
