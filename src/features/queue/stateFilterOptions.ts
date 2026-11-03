import { stateLabel } from '@/features/applications/stateLabel'
import { CORE_STATES } from '@/features/applications/states'
import { ALL_BUT_DRAFT_PARAM } from '@/features/queue/stateScopes'

export function stateFilterOptions(): [string, string][] {
  return [
    ['', 'Needs action'],
    [ALL_BUT_DRAFT_PARAM, 'All but draft'],
    ...CORE_STATES.map((s): [string, string] => [s, stateLabel(s)]),
  ]
}
