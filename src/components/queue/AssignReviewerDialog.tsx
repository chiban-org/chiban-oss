'use client'

import { ActionForm } from '@/components/ActionForm'
import { SelectField } from '@/components/staff/fields'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import type { ActionResult } from '@/server/actionRunner'

export interface QueueReviewer {
  id: string
  name: string
}

interface Props {
  row: WorkQueueRow | null
  reviewers: QueueReviewer[]
  assign: (formData: FormData) => Promise<ActionResult>
  onClose: () => void
}

export function AssignReviewerDialog({ row, reviewers, assign, onClose }: Props) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a reviewer</DialogTitle>
          <DialogDescription>{row === null ? '' : `Application ${row.number}`}</DialogDescription>
        </DialogHeader>
        {row === null ? null : (
          <ActionForm action={assign} submitLabel="Assign" variant="default">
            <input type="hidden" name="applicationId" value={row.applicationId} />
            <SelectField
              label="Reviewer"
              name="reviewerUserId"
              options={reviewers.map((r): [string, string] => [r.id, r.name])}
            />
          </ActionForm>
        )}
      </DialogContent>
    </Dialog>
  )
}
