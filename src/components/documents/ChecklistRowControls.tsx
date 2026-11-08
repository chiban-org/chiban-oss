import {
  PlainItemAction,
  ReasonForm,
  UseExistingFile,
} from '@/components/documents/ChecklistControls'
import type { ItemProps } from '@/components/documents/ChecklistItem'
import { ItemUploader } from '@/components/documents/ItemUploader'

function FileUpload({ props }: { props: ItemProps }) {
  const { row, applicationId, actions } = props
  if (actions.upload === undefined) return null
  return (
    <ItemUploader
      applicationId={applicationId}
      itemKey={row.key}
      label={row.label}
      maxBytes={props.maxBytes}
      actions={actions.upload}
      {...(row.files.length === 0
        ? {}
        : {
            replaces: { documentIds: row.files.map((f) => f.documentId), unlink: actions.unlink },
          })}
    />
  )
}

function ExistingFile({ props }: { props: ItemProps }) {
  const { row } = props
  const linked = new Set(row.files.map((f) => f.documentId))
  return (
    <UseExistingFile
      applicationId={props.applicationId}
      itemKey={row.key}
      label={row.label}
      choices={props.files.filter((f) => !linked.has(f.documentId))}
      action={props.actions.link}
    />
  )
}

function WaiverControls({ props }: { props: ItemProps }) {
  const { row, applicationId, actions } = props
  if (!row.waivable || row.files.length > 0 || row.accepted !== null) return null
  if (row.waiver !== null) {
    return actions.withdrawWaiver === undefined ? null : (
      <PlainItemAction
        applicationId={applicationId}
        itemKey={row.key}
        submitLabel="Withdraw the waiver request"
        action={actions.withdrawWaiver}
      />
    )
  }
  const staff = props.actor === 'staff'
  return actions.requestWaiver === undefined ? null : (
    <ReasonForm
      applicationId={applicationId}
      itemKey={row.key}
      summary={staff ? 'Record a waiver request' : 'Request a waiver'}
      reasonLabel={
        staff ? 'The reason the applicant gave for the waiver' : 'Why should the board waive this?'
      }
      submitLabel={staff ? 'Record waiver request' : 'Request waiver'}
      action={actions.requestWaiver}
    />
  )
}

export function ApplicantControls({ props }: { props: ItemProps }) {
  const { row } = props
  if (!props.permissions.canFile || !row.open || row.status === 'not_needed') return null
  return (
    <div className="grid gap-2">
      <FileUpload props={props} />
      {row.files.length > 0 ? null : <ExistingFile props={props} />}
      <WaiverControls props={props} />
    </div>
  )
}

function AcceptControls({ props }: { props: ItemProps }) {
  const { row, applicationId, actions } = props
  if (!props.permissions.canAccept) return null
  if (row.accepted !== null) {
    return actions.undoAccept === undefined ? null : (
      <PlainItemAction
        applicationId={applicationId}
        itemKey={row.key}
        submitLabel="Undo acceptance"
        action={actions.undoAccept}
      />
    )
  }
  if (row.files.length > 0 || actions.accept === undefined) return null
  return (
    <ReasonForm
      applicationId={applicationId}
      itemKey={row.key}
      summary="Accept without the document"
      reasonLabel={`Why ${row.label} is not needed`}
      submitLabel="Accept without the document"
      action={actions.accept}
    />
  )
}

export function StaffControls({ props }: { props: ItemProps }) {
  if (props.row.status === 'not_needed') return null
  const filing = props.permissions.canFile
  return (
    <div className="grid gap-2">
      {filing ? <FileUpload props={props} /> : null}
      {filing ? <ExistingFile props={props} /> : null}
      {filing ? <WaiverControls props={props} /> : null}
      <AcceptControls props={props} />
    </div>
  )
}
