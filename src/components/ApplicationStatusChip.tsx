import { StatusChip } from '@/components/StatusChip'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import type { CoreState } from '@/features/applications/states'
import { applicationStatusText } from '@/features/applications/statusText'

export function ApplicationStatusChip({
  state,
  substep,
  substepLabel,
}: {
  state: CoreState
  substep: string | null
  substepLabel: string | null
}) {
  return (
    <StatusChip
      status={applicationChipStatus(state)}
      label={applicationStatusText(
        state,
        substep,
        substep === null || substepLabel === null ? [] : [{ key: substep, label: substepLabel }],
      )}
    />
  )
}
