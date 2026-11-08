import Link from 'next/link'
import {
  createStaffUploadIntentAction,
  finalizeStaffUploadAction,
} from '@/app/(staff)/staff/records/uploadActions'
import { ApplicationFileUploader } from '@/components/documents/ApplicationFileUploader'
import { NEW_TAB } from '@/components/newTab'
import { intakeHref } from '@/features/counter/intake/intakeHref'
import type { DocumentListRow } from '@/features/documents/types'

const UPLOAD_ACTIONS = {
  createIntent: createStaffUploadIntentAction,
  finalize: finalizeStaffUploadAction,
}

function Scanned({ documents }: { documents: readonly DocumentListRow[] }) {
  if (documents.length === 0) return <p>Nothing scanned or uploaded yet.</p>
  return (
    <ul className="list-none space-y-1 p-0">
      {documents.map((doc) => (
        <li key={doc.documentId}>
          <Link {...NEW_TAB} href={`/api/documents/${doc.documentId}`}>
            {doc.title}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function DocumentsStep({
  applicationId,
  documents,
}: {
  applicationId: string
  documents: readonly DocumentListRow[]
}) {
  return (
    <section aria-labelledby="documents" className="flex flex-col gap-4">
      <h2 id="documents">Documents</h2>
      <p>Scan or upload the plans, letters and other papers the applicant brought.</p>
      <Scanned documents={documents} />
      <ApplicationFileUploader
        applicationId={applicationId}
        fileLabel="Scanned document"
        actions={UPLOAD_ACTIONS}
      />
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Link href={intakeHref(applicationId, 'submit')} className="font-semibold">
          Continue to attestation and submit
        </Link>
        <Link href={intakeHref(applicationId, 'form')}>Back to the application form</Link>
      </div>
    </section>
  )
}
