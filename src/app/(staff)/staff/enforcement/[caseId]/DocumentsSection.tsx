import { DocumentPanel } from '@/components/documents/DocumentPanel'
import { env } from '@/config/env'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { PANEL_ACTIONS } from '../../records/panelActions'
import { createCaseUploadIntentAction, finalizeCaseUploadAction } from '../uploadActions'
import { CaseUploader } from './CaseUploader'
import type { Can } from './can'

const KINDS: [string, string][] = [
  ['enforcement_photo', 'Photo of the property'],
  ['service_proof', 'Proof of service'],
  ['court_document', 'Court document'],
  ['enforcement_letter', 'Letter or other case document'],
]

export function DocumentsSection({ detail, can }: { detail: CaseDetail; can: Can }) {
  const caseId = detail.staff.row.id
  return (
    <DocumentPanel
      title="Documents and photos"
      emptyText="No documents yet."
      intro={
        <p>
          A document reaches the public only once it is approved for the public and the case is
          public.
        </p>
      }
      documents={detail.documents}
      canPublish={can.publish}
      canManage={can.manageDocuments}
      actions={PANEL_ACTIONS}
      target={{ kind: 'enforcement_case', id: caseId }}
    >
      {can.manage || can.service ? (
        <details>
          <summary>Upload a document or photo</summary>
          <CaseUploader
            caseId={caseId}
            kinds={KINDS}
            maxBytes={env.MAX_UPLOAD_BYTES}
            actions={{
              createIntent: createCaseUploadIntentAction,
              finalize: finalizeCaseUploadAction,
            }}
          />
        </details>
      ) : null}
    </DocumentPanel>
  )
}
