import { env } from '@/config/env'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { DOCUMENT_KIND_LABELS } from '@/features/enforcement/labels'
import { formatInstantDate } from '@/lib/formatDate'
import { createCaseUploadIntentAction, finalizeCaseUploadAction } from '../uploadActions'
import { CaseUploader } from './CaseUploader'
import type { Can } from './can'
import { Section } from './Section'

const KINDS: [string, string][] = [
  ['enforcement_photo', 'Photo of the property'],
  ['service_proof', 'Proof of service'],
  ['court_document', 'Court document'],
  ['enforcement_letter', 'Letter or other case document'],
]

export function DocumentsSection({
  detail,
  can,
  zone,
}: {
  detail: CaseDetail
  can: Can
  zone: string
}) {
  const caseId = detail.staff.row.id
  return (
    <Section id="documents" title="Documents and photos">
      {detail.documents.length === 0 ? <p>No documents yet.</p> : null}
      <ul className="m-0 list-none space-y-1 p-0">
        {detail.documents.map((d) => (
          <li key={d.documentId}>
            <a href={`/api/documents/${d.documentId}`} className="text-action underline">
              {d.title}
            </a>
            {`, ${DOCUMENT_KIND_LABELS[d.docKind as keyof typeof DOCUMENT_KIND_LABELS]}, added ${formatInstantDate(new Date(d.createdAt), zone)}. ${d.isPublic ? 'Public.' : 'Private.'}`}
          </li>
        ))}
      </ul>
      {can.manage || can.service ? (
        <details>
          <summary className="cursor-pointer font-medium">Upload a document or photo</summary>
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
    </Section>
  )
}
