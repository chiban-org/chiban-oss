import type { dispositionBatches } from '@/db/schema'
import type { Status } from '@/features/design/tokens'

type BatchStatus = (typeof dispositionBatches.$inferSelect)['status']

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  proposed: 'Waiting for approval',
  approved: 'Approved',
  executing: 'Being carried out',
  executed: 'Carried out',
  cancelled: 'Cancelled',
}

export const BATCH_CHIP: Record<BatchStatus, Status> = {
  proposed: 'neutral',
  approved: 'neutral',
  executing: 'neutral',
  executed: 'passed',
  cancelled: 'neutral',
}
