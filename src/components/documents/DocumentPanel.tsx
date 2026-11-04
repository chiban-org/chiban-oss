import type { ReactNode } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { RecordKeeping, SeriesLine, sharedSeries } from '@/components/documents/RecordKeeping'
import { RedactedUploader } from '@/components/documents/RedactedUploader'
import type { UploaderActions } from '@/components/documents/Uploader'
import { NEW_TAB } from '@/components/newTab'
import { StatusChip } from '@/components/StatusChip'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import type { PanelDocument, RenditionState } from '@/features/documents/panelData'
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
  title?: string
  intro?: ReactNode
  emptyText?: string
  children?: ReactNode
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  project_parties: 'Project parties',
  reviewers: 'Reviewers',
  board: 'Board',
}

type Chip = { status: 'passed' | 'failed' | 'overdue' | 'neutral'; label: string }

const RENDITION_CHIP: Record<Exclude<RenditionState, 'approved'>, Chip> = {
  public_no_copy: { status: 'failed', label: 'Public, no approved copy' },
  redacted_waiting: { status: 'overdue', label: 'Redacted, awaiting approval' },
  revoked: { status: 'failed', label: 'Revoked' },
  none: { status: 'neutral', label: 'Not public' },
}

function publicChip(doc: PanelDocument): Chip {
  if (doc.rendition !== 'approved') return RENDITION_CHIP[doc.rendition]
  if (!doc.isPublic) return { status: 'neutral', label: 'Approved, not public' }
  return {
    status: 'passed',
    label:
      doc.approvedRole === 'public_redacted' ? 'Public copy: redacted' : 'Public copy: original',
  }
}

const VERSION_LABELS = { original: 'Original', public_redacted: 'Redacted copy' } as const

function versionLabel(v: PanelDocument['approvable'][number]): string {
  const day = formatCivilDate(v.createdAt.slice(0, 10))
  const time = v.role === 'public_redacted' ? ` ${v.createdAt.slice(11, 16)} UTC` : ''
  return `${VERSION_LABELS[v.role]}, ${day}${time}`
}

function ApprovalControls({ doc, actions }: { doc: PanelDocument; actions: DocumentPanelActions }) {
  const candidates = doc.approvable.filter((v) => v.id !== doc.approvedVersionId)
  return (
    <>
      {actions.approve !== undefined && candidates.length > 0 ? (
        <ActionForm action={actions.approve} submitLabel="Approve for the public">
          <input type="hidden" name="purpose" value="public" />
          {doc.approvalId === null ? null : (
            <p className="m-0 text-sm">
              Approving another version replaces the current public copy.
            </p>
          )}
          <SelectField
            label="Version to approve"
            name="versionId"
            options={candidates.map((v) => [v.id, versionLabel(v)] as const)}
          />
          <TextField label="What you checked before approving" name="reviewStatement" required />
        </ActionForm>
      ) : null}
      {actions.revoke !== undefined && doc.approvalId !== null ? (
        <ActionForm action={actions.revoke} submitLabel="Revoke the approval">
          <input type="hidden" name="approvalId" value={doc.approvalId} />
          <TextField label="Why it is being revoked" name="reason" required />
        </ActionForm>
      ) : null}
    </>
  )
}

function mayAct(doc: PanelDocument, props: Props): boolean {
  return props.canManage || props.canPublish || (doc.canRedact && doc.originalVersionId !== null)
}

function ManageControls({
  doc,
  props,
  seriesShown,
}: {
  doc: PanelDocument
  props: Props
  seriesShown: boolean
}) {
  return (
    <details>
      <summary className="text-sm">{mayAct(doc, props) ? 'Manage' : 'Details'}</summary>
      <div className="mt-3 space-y-4 rounded-md bg-canvas p-4">
        <RecordKeeping doc={doc} seriesShown={seriesShown} />
        {props.canManage ? (
          <ActionForm action={props.actions.setAudiences} submitLabel="Save audiences">
            <input type="hidden" name="documentId" value={doc.documentId} />
            <div className="flex flex-wrap gap-4">
              {AUDIENCES.map((a) => (
                <CheckField
                  key={a}
                  label={AUDIENCE_LABELS[a]}
                  name="audience"
                  value={a}
                  defaultChecked={doc.audiences.includes(a)}
                />
              ))}
            </div>
          </ActionForm>
        ) : null}
        {props.canPublish ? (
          <>
            <ActionForm action={props.actions.setPublic} submitLabel="Save public setting">
              <input type="hidden" name="documentId" value={doc.documentId} />
              <CheckField
                label="Public"
                name="isPublic"
                value="true"
                defaultChecked={doc.isPublic}
              />
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
          <a href={`/staff/records/redact/${doc.originalVersionId}`} className="inline-block">
            Redact this document
          </a>
        ) : null}
        {props.canManage &&
        doc.preservation === 'incomplete' &&
        doc.preservationRecordId !== null ? (
          <ActionForm action={props.actions.retry} submitLabel="Retry preservation">
            <input type="hidden" name="recordId" value={doc.preservationRecordId} />
          </ActionForm>
        ) : null}
      </div>
    </details>
  )
}

function DocumentRow({
  doc,
  props,
  seriesShown,
}: {
  doc: PanelDocument
  props: Props
  seriesShown: boolean
}) {
  const chip = publicChip(doc)
  return (
    <li className="space-y-2 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <a {...NEW_TAB} href={`/api/documents/${doc.documentId}`} className="font-medium">
          {doc.title}
        </a>
        <StatusChip status={chip.status} label={chip.label} />
        {doc.holdCount > 0 ? <StatusChip status="overdue" label="Legal hold" /> : null}
      </div>
      <p className="m-0 text-sm text-muted-foreground">
        {`Added ${formatCivilDate(doc.createdAt.slice(0, 10))} by ${doc.uploadedBy}`}
      </p>
      <ManageControls doc={doc} props={props} seriesShown={seriesShown} />
    </li>
  )
}

export function DocumentPanel(props: Props) {
  const series = sharedSeries(props.documents)
  return (
    <section aria-label={props.title ?? 'Documents'}>
      <h2>{props.title ?? 'Documents'}</h2>
      {props.documents.length === 0 ? (
        <p>{props.emptyText ?? 'No documents are attached.'}</p>
      ) : (
        props.intro
      )}
      {series === undefined ? null : (
        <p className="text-sm text-muted-foreground">
          <SeriesLine series={series} />
        </p>
      )}
      <ul className="m-0 list-none divide-y p-0">
        {props.documents.map((doc) => (
          <DocumentRow
            key={doc.documentId}
            doc={doc}
            props={props}
            seriesShown={series !== undefined}
          />
        ))}
      </ul>
      {props.children}
    </section>
  )
}
