import type { EnforcementStatus } from '@/db/schema'
import type { Status } from '@/features/design/tokens'

const CHIP: Record<EnforcementStatus, Status> = {
  intake: 'neutral',
  investigating: 'neutral',
  violation_found: 'failed',
  no_violation: 'passed',
  order_issued: 'overdue',
  in_court: 'overdue',
  resolved: 'passed',
  closed: 'neutral',
}

export function caseChipStatus(status: EnforcementStatus): Status {
  return CHIP[status]
}
