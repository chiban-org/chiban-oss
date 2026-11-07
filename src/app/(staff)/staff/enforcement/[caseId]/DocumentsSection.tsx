import { DocumentPanel } from '@/components/documents/DocumentPanel'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { PANEL_ACTIONS } from '../../records/panelActions'
import { CaseUploadAll } from './CaseFileUpload'
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
          A document shows on the public site only while the case is public, and only once a copy is
          approved for the public and Show on the public site is ticked.
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
          <CaseUploadAll caseId={caseId} kinds={KINDS} />
        </details>
      ) : null}
    </DocumentPanel>
  )
}
