import { ActionForm } from '@/components/ActionForm'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { PracticeNotice } from '@/components/PracticeNotice'
import type { ExportTargetView } from '@/features/export/targets/manageTargets'
import { ONEDRIVE_STUB_NOTE } from '@/features/export/targets/oneDrive'
import { saveTargetAction } from './actions'
import { TargetFields } from './TargetFields'

export function StubNote() {
  return <PracticeNotice>{ONEDRIVE_STUB_NOTE}</PracticeNotice>
}

export function AddTarget() {
  return (
    <FormDialog
      label="Add a target"
      title="Add a target"
      description="Choose where the monthly copies go."
      variant="default"
    >
      <details>
        <summary>A folder on the server</summary>
        <ActionForm action={saveTargetAction} submitLabel="Add the folder">
          <TargetFields kind="local_fs" idPrefix="add-local" />
        </ActionForm>
      </details>
      <details>
        <summary>An S3 bucket</summary>
        <ActionForm action={saveTargetAction} submitLabel="Add the bucket">
          <TargetFields kind="s3" idPrefix="add-s3" />
        </ActionForm>
      </details>
      <details>
        <summary>A OneDrive or SharePoint drive</summary>
        <StubNote />
        <ActionForm action={saveTargetAction} submitLabel="Add the drive">
          <TargetFields kind="onedrive" idPrefix="add-onedrive" />
        </ActionForm>
      </details>
    </FormDialog>
  )
}

export function EditTarget({ target }: { target: ExportTargetView }) {
  return (
    <RowEditDialog record={target.name} title={`Edit ${target.name}`}>
      <ActionForm action={saveTargetAction} submitLabel="Save changes">
        <TargetFields kind={target.kind} idPrefix={`edit-${target.id}`} current={target} />
      </ActionForm>
    </RowEditDialog>
  )
}
