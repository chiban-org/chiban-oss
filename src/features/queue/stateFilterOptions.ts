import { stateLabel } from '@/features/applications/stateLabel'
import { CORE_STATES } from '@/features/applications/states'

export function stateFilterOptions(): [string, string][] {
  return CORE_STATES.map((s): [string, string] => [s, stateLabel(s)])
}
