import { type CoreState, STATE_LABELS } from '@/features/applications/states'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'

export function stateLabel(state: CoreState): string {
  return state === 'suspended'
    ? ruleByKey(loadPack(), 'nh.appeal.suspension').label
    : STATE_LABELS[state]
}
