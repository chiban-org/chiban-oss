import { DocumentChecklist } from '@/components/documents/DocumentChecklist'
import type { DocumentChecklistView } from '@/features/applications/documentChecklistView'
import {
  acceptItemAction,
  staffLinkItemAction,
  staffUnlinkItemAction,
  undoAcceptItemAction,
} from './documentItemActions'

const STAFF_ACTIONS = {
  link: staffLinkItemAction,
  unlink: staffUnlinkItemAction,
  accept: acceptItemAction,
  undoAccept: undoAcceptItemAction,
}

export function RequiredDocuments(props: {
  checklist: DocumentChecklistView
  canFile: boolean
  canAccept: boolean
}) {
  return (
    <section aria-label="Required documents" className="mb-6">
      <h3>Required documents</h3>
      <DocumentChecklist
        view={props.checklist}
        actor="staff"
        permissions={{ canFile: props.canFile, canAccept: props.canAccept, canUploadOther: false }}
        actions={STAFF_ACTIONS}
        maxBytes={0}
        headingLevel="h4"
      />
    </section>
  )
}
