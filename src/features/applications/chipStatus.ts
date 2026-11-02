import type { Status } from '@/features/design/tokens'
import type { CoreState } from './states'

const CHIP_STATUS: Partial<Record<CoreState, Status>> = {
  issued: 'passed',
  suspended: 'overdue',
  denied: 'failed',
  expired: 'failed',
}

export function applicationChipStatus(state: CoreState): Status {
  return CHIP_STATUS[state] ?? 'neutral'
}
