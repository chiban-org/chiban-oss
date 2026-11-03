import { CORE_STATES, type CoreState, TERMINAL_STATES } from '@/features/applications/states'

export const ALL_BUT_DRAFT_PARAM = 'all'

export const ALL_BUT_DRAFT_STATES: readonly CoreState[] = CORE_STATES.filter(
  (state) => state !== 'draft',
)

export const NEEDS_ACTION_STATES: readonly CoreState[] = ALL_BUT_DRAFT_STATES.filter(
  (state) => !TERMINAL_STATES.includes(state),
)

export function statesForParam(param: string | undefined): CoreState[] | undefined {
  if (param === ALL_BUT_DRAFT_PARAM) return [...ALL_BUT_DRAFT_STATES]
  const state = CORE_STATES.find((s) => s === param)
  return state === undefined ? undefined : [state]
}
