'use client'

import { ReferenceList } from '@/components/config/formBuilder/ReferenceList'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
    <Dialog open={label !== null} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Remove “${label ?? ''}”?`}</DialogTitle>
          <DialogDescription>
            Other parts of the configuration use this question. Rules on other questions that use it
            are removed with it. Fee schedules and the other places listed keep looking for its
            answer until you change them.
          </DialogDescription>
        </DialogHeader>
        <ReferenceList references={references} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Keep question
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Remove anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
