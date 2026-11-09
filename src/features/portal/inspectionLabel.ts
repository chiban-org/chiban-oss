import type { Status } from '@/features/design/tokens'

type InspectionStatus = 'requested' | 'scheduled' | 'passed' | 'failed' | 'cancelled'

const CHIP: Record<InspectionStatus, Status> = {
  requested: 'neutral',
  scheduled: 'neutral',
  passed: 'passed',
  failed: 'failed',
  cancelled: 'neutral',
}

const LABEL: Record<InspectionStatus, string> = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  passed: 'Passed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export function portalInspectionLabel(
  row: { status: InspectionStatus; scheduledDate: string | null },
  today: string,
): { chip: Status; label: string } {
  const pending =
    row.status === 'scheduled' && row.scheduledDate !== null && row.scheduledDate < today
  return { chip: CHIP[row.status], label: pending ? 'Result pending' : LABEL[row.status] }
}
