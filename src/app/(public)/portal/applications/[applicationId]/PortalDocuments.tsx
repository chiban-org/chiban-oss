import Link from 'next/link'
import { DocumentChecklist } from '@/components/documents/DocumentChecklist'
import { NEW_TAB } from '@/components/newTab'
import { env } from '@/config/env'
import type { DocumentChecklistView } from '@/features/applications/documentChecklistView'
import { groupRevisions } from '@/features/documents/revisions'
import type { DocumentListRow } from '@/features/documents/types'
import type { PortalApplicationView } from '@/features/portal/portalView'
import { formatInstant } from '@/lib/formatDate'
import { PORTAL_CHECKLIST_ACTIONS } from './checklistActions'
import { UploadSection } from './UploadSection'

function DocumentLink({ doc, zone }: { doc: DocumentListRow; zone: string }) {
  return (
    <>
      <Link
        {...NEW_TAB}
        href={`/api/documents/${doc.documentId}`}
        className="tap-target inline-flex items-center"
      >
        {doc.title}
      </Link>
      <span className="ml-2 text-muted-foreground">
        {formatInstant(new Date(doc.createdAt), zone)}
      </span>
    </>
  )
}

function DocumentGroups({ documents, zone }: { documents: DocumentListRow[]; zone: string }) {
  return (
    <ul className="space-y-1">
      {groupRevisions(documents).map(({ current, earlier }) => (
        <li key={current.documentId}>
          <DocumentLink doc={current} zone={zone} />
          {earlier.length === 0 ? null : (
            <div className="ml-4">
              <p className="m-0 text-muted-foreground">
                Earlier versions, replaced by the copy above
              </p>
              <ul className="m-0 space-y-1">
                {earlier.map((d) => (
                  <li key={d.documentId}>
                    <DocumentLink doc={d} zone={zone} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function PortalDocuments({
  view,
  checklist,
  zone,
}: {
  view: PortalApplicationView
  checklist: DocumentChecklistView | null
  zone: string
}) {
  if (checklist !== null) {
    return (
      <DocumentChecklist
        view={checklist}
        actor="applicant"
        permissions={{ canFile: view.isParty, canAccept: false, canUploadOther: view.canUpload }}
        actions={PORTAL_CHECKLIST_ACTIONS}
        maxBytes={env.MAX_UPLOAD_BYTES}
      />
    )
  }
  return (
    <>
      {view.documents.length === 0 ? (
        <p>No documents yet.</p>
      ) : (
        <DocumentGroups documents={view.documents} zone={zone} />
      )}
      {view.canUpload ? (
        <UploadSection applicationId={view.applicationId} maxBytes={env.MAX_UPLOAD_BYTES} />
      ) : null}
    </>
  )
}
