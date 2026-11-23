import { type CoreState, STATE_LABELS } from '@/features/applications/states'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { packRoles } from '@/features/packs/roles'

export function stateLabel(state: CoreState): string {
  const suspension = packRoles().rules.appealSuspension
  return state === 'suspended' && suspension !== null
    ? ruleByKey(loadPack(), suspension).label
    : STATE_LABELS[state]
}
