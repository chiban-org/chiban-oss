import type { ReactNode } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { RecordKeeping } from '@/components/documents/RecordKeeping'
import type { UploaderActions } from '@/components/documents/Uploader'
import { WhoCanSee } from '@/components/documents/WhoCanSee'
import { NEW_TAB } from '@/components/newTab'
import { StatusChip } from '@/components/StatusChip'
import type { PanelDocument } from '@/features/documents/panelData'
import type { RecordRef } from '@/features/documents/types'
import { publicChip } from '@/features/documents/whoCanSee'
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

export interface DocumentPanelProps {
  documents: PanelDocument[]
  canPublish: boolean
  canManage: boolean
  actions: DocumentPanelActions
  target: RecordRef
  title?: string
  intro?: ReactNode
  emptyText?: string
  lead?: ReactNode
  children?: ReactNode
}

function mayAct(doc: PanelDocument, props: DocumentPanelProps): boolean {
  return props.canManage || (doc.canRedact && doc.originalVersionId !== null)
}

function ManageControls({
  doc,
  props,
  seriesShown,
}: {
  doc: PanelDocument
  props: DocumentPanelProps
  seriesShown: boolean
}) {
  return (
    <details>
      <summary className="text-sm">{mayAct(doc, props) ? 'Manage' : 'Details'}</summary>
      <div className="mt-3 space-y-4 rounded-md bg-canvas p-4">
        <RecordKeeping doc={doc} seriesShown={seriesShown} />
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

export function DocumentRow({
  doc,
  props,
  seriesShown,
}: {
  doc: PanelDocument
  props: DocumentPanelProps
  seriesShown: boolean
}) {
  const chip = publicChip(doc)
  return (
    <li data-slot="document" className="record-item grid gap-1 pb-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a {...NEW_TAB} href={`/api/documents/${doc.documentId}`} className="font-medium">
          {doc.title}
        </a>
        <StatusChip status={chip.status} label={chip.label} />
        {doc.supersededBy === null ? null : <StatusChip status="neutral" label="Superseded" />}
        {doc.holdCount > 0 ? <StatusChip status="overdue" label="Legal hold" /> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {`Added ${formatCivilDate(doc.createdAt.slice(0, 10))} by ${doc.uploadedBy}`}
      </p>
      <WhoCanSee doc={doc} props={props} />
      <div className="mt-1">
        <ManageControls doc={doc} props={props} seriesShown={seriesShown} />
      </div>
    </li>
  )
}
