import { StatusChip } from '@/components/StatusChip'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import type { CoreState } from '@/features/applications/states'

export function ApplicationStatusChip({ state, label }: { state: CoreState; label: string }) {
  return <StatusChip status={applicationChipStatus(state)} label={label} />
}
