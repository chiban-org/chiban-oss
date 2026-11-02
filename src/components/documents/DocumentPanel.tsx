import { ActionForm } from '@/components/ActionForm'
import { RedactedUploader } from '@/components/documents/RedactedUploader'
import type { UploaderActions } from '@/components/documents/Uploader'
import { StatusChip } from '@/components/StatusChip'
import type { PanelDocument, PreservationState } from '@/features/documents/panelData'
import { AUDIENCES, type Audience, type RecordRef } from '@/features/documents/types'
import type { ActionResult } from '@/server/actionRunner'

type FormAction = (formData: FormData) => Promise<ActionResult>

export interface DocumentPanelActions {
  setAudiences: FormAction
  setPublic: FormAction
  retry: FormAction
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

function publicCopyText(doc: PanelDocument): string | null {
  if (!doc.isPublic) return null
  return doc.hasRedactedCopy ? 'Public copy: redacted' : 'Public copy: original'
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
        {publicCopy === null ? <span>Not public</span> : <span>{publicCopy}</span>}
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
          <RedactedUploader
            documentId={doc.documentId}
            target={props.target}
            actions={props.actions.uploadRedacted}
          />
        </>
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
