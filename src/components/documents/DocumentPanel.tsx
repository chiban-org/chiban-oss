import { ActionForm } from '@/components/ActionForm'
import { RedactedUploader } from '@/components/documents/RedactedUploader'
import type { UploaderActions } from '@/components/documents/Uploader'
import { StatusChip } from '@/components/StatusChip'
import type {
  PanelDocument,
  PreservationState,
  RenditionState,
} from '@/features/documents/panelData'
import { AUDIENCES, type Audience, type RecordRef } from '@/features/documents/types'
import { formatCivilDate } from '@/lib/formatDate'
import type { ActionResult } from '@/server/actionRunner'

type FormAction = (formData: FormData) => Promise<ActionResult>

export interface DocumentPanelActions {
  setAudiences: FormAction
  setPublic: FormAction
  retry: FormAction
  approve?: FormAction
  revoke?: FormAction
  uploadRedacted: UploaderActions
}

interface Props {
  documents: PanelDocument[]
  canPublish: boolean
  canManage: boolean
  actions: DocumentPanelActions
  target: RecordRef
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  project_parties: 'Project parties',
  reviewers: 'Reviewers',
  board: 'Board',
}

const PRESERVATION_CHIP: Record<
  PreservationState,
  { status: 'passed' | 'failed' | 'overdue' | 'neutral'; label: string }
> = {
  preserved: { status: 'passed', label: 'Preserved' },
  incomplete: { status: 'failed', label: 'Preservation incomplete' },
  not_required: { status: 'neutral', label: 'Preservation not required' },
  pending: { status: 'overdue', label: 'Preservation pending' },
}

const RENDITION_CHIP: Record<
  RenditionState,
  { status: 'passed' | 'failed' | 'overdue' | 'neutral'; label: string } | null
> = {
  approved: { status: 'passed', label: 'Approved for public' },
  public_no_copy: { status: 'failed', label: 'Public, no approved copy' },
  redacted_waiting: { status: 'overdue', label: 'Redacted, awaiting approval' },
  revoked: { status: 'failed', label: 'Revoked' },
  none: null,
}

const VERSION_LABELS = { original: 'Original', public_redacted: 'Redacted copy' } as const

function publicCopyText(doc: PanelDocument): string | null {
  if (!doc.isPublic) return null
  if (doc.rendition !== 'approved') return null
  return doc.approvedRole === 'public_redacted' ? 'Public copy: redacted' : 'Public copy: original'
}

function versionLabel(v: PanelDocument['approvable'][number]): string {
  const day = formatCivilDate(v.createdAt.slice(0, 10))
  const time = v.role === 'public_redacted' ? ` ${v.createdAt.slice(11, 16)} UTC` : ''
  return `${VERSION_LABELS[v.role]}, ${day}${time}`
}

function ApprovalControls({ doc, actions }: { doc: PanelDocument; actions: DocumentPanelActions }) {
  return (
    <>
      {actions.approve !== undefined && doc.rendition !== 'approved' ? (
        <ActionForm action={actions.approve} submitLabel="Approve for the public">
          <input type="hidden" name="purpose" value="public" />
          <label className="block text-sm font-medium">
            Version to approve
            <select
              name="versionId"
              className="mt-1 block w-full rounded-md border bg-surface px-3 py-2 text-sm"
            >
              {doc.approvable.map((v) => (
                <option key={v.id} value={v.id}>
                  {versionLabel(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            What you checked before approving
            <input
              name="reviewStatement"
              required
              className="mt-1 block w-full rounded-md border bg-surface px-3 py-2 text-sm"
            />
          </label>
        </ActionForm>
      ) : null}
      {actions.revoke !== undefined && doc.approvalId !== null ? (
        <ActionForm action={actions.revoke} submitLabel="Revoke the approval">
          <input type="hidden" name="approvalId" value={doc.approvalId} />
          <label className="block text-sm font-medium">
            Why it is being revoked
            <input
              name="reason"
              required
              className="mt-1 block w-full rounded-md border bg-surface px-3 py-2 text-sm"
            />
          </label>
        </ActionForm>
      ) : null}
    </>
  )
}

function DocumentRow({ doc, props }: { doc: PanelDocument; props: Props }) {
  const chip = PRESERVATION_CHIP[doc.preservation]
  const publicCopy = publicCopyText(doc)
  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <a href={`/api/documents/${doc.documentId}`} className="font-medium text-action underline">
          {doc.title}
        </a>
        <StatusChip status={chip.status} label={chip.label} />
        {doc.holdCount > 0 ? <StatusChip status="overdue" label="Legal hold" /> : null}
        {RENDITION_CHIP[doc.rendition] === null ? null : (
          <StatusChip
            status={RENDITION_CHIP[doc.rendition]?.status ?? 'neutral'}
            label={RENDITION_CHIP[doc.rendition]?.label ?? ''}
          />
        )}
        {doc.isPublic ? (
          publicCopy === null ? null : (
            <span>{publicCopy}</span>
          )
        ) : (
          <span>Not public</span>
        )}
      </div>
      <p className="m-0">
        {doc.series === null ? (
          'No record series assigned'
        ) : (
          <>
            <span>{doc.series.label}</span>{' '}
            <a href={doc.series.citation.url} className="text-action underline">
              {doc.series.citation.label}
            </a>
          </>
        )}
        {`. `}
        <span>{doc.retention}</span>
      </p>
      {props.canManage ? (
        <ActionForm action={props.actions.setAudiences} submitLabel="Save audiences">
          <input type="hidden" name="documentId" value={doc.documentId} />
          <div className="flex flex-wrap gap-4">
            {AUDIENCES.map((a) => (
              <label key={a} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="audience"
                  value={a}
                  defaultChecked={doc.audiences.includes(a)}
                />
                {AUDIENCE_LABELS[a]}
              </label>
            ))}
          </div>
        </ActionForm>
      ) : null}
      {props.canPublish ? (
        <>
          <ActionForm action={props.actions.setPublic} submitLabel="Save public setting">
            <input type="hidden" name="documentId" value={doc.documentId} />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isPublic" value="true" defaultChecked={doc.isPublic} />
              Public
            </label>
          </ActionForm>
          <ApprovalControls doc={doc} actions={props.actions} />
          <RedactedUploader
            documentId={doc.documentId}
            target={props.target}
            actions={props.actions.uploadRedacted}
          />
        </>
      ) : null}
      {doc.canRedact && doc.originalVersionId !== null ? (
        <a
          href={`/staff/records/redact/${doc.originalVersionId}`}
          className="inline-block text-action underline"
        >
          Redact this document
        </a>
      ) : null}
      {props.canManage && doc.preservation === 'incomplete' && doc.preservationRecordId !== null ? (
        <ActionForm action={props.actions.retry} submitLabel="Retry preservation">
          <input type="hidden" name="recordId" value={doc.preservationRecordId} />
        </ActionForm>
      ) : null}
    </li>
  )
}

export function DocumentPanel(props: Props) {
  return (
    <section aria-label="Documents">
      <h2>Documents</h2>
      {props.documents.length === 0 ? <p>No documents are attached.</p> : null}
      <ul className="m-0 list-none space-y-3 p-0">
        {props.documents.map((doc) => (
          <DocumentRow key={doc.documentId} doc={doc} props={props} />
        ))}
      </ul>
    </section>
  )
}
