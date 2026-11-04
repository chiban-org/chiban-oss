'use client'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ReferenceList } from '@/components/config/formBuilder/ReferenceList'
import type { FieldReference } from '@/features/forms/formReferences'

export function RemoveQuestionDialog({
  label,
  references,
  onConfirm,
  onCancel,
}: {
  label: string | null
  references: FieldReference[]
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ConfirmDialog
      open={label !== null}
      copy={{
        title: `Remove “${label ?? ''}”?`,
        body: 'Other parts of the configuration use this question. Rules on other questions that use it are removed with it. Fee schedules and the other places listed keep looking for its answer until you change them.',
        confirmLabel: 'Remove anyway',
        cancelLabel: 'Keep question',
      }}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <ReferenceList references={references} />
    </ConfirmDialog>
  )
}
