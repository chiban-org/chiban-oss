import { CORE_STATES } from '@/features/applications/states'
import { firstParam, type RawSearchParams, readTableParams } from '@/features/dataTable/params'
import { APPLICATIONS_PATH } from '@/features/queue/queueParams'
import { DEFAULT_STATUS_TAB, STATUS_TAB_PARAM, tabForState } from '@/features/queue/stateScopes'

const CARRIED = ['q', 'due', 'assigned', 'type', 'flag', 'sort', 'dir'] as const

export function queueRedirectHref(raw: RawSearchParams): string {
  const params = readTableParams(raw)
  const query = new URLSearchParams()
  const state = firstParam(params, 'state')
  const tab = tabForState(state)
  if (tab !== DEFAULT_STATUS_TAB) query.append(STATUS_TAB_PARAM, tab)
  if (CORE_STATES.some((s) => s === state)) query.append('state', state ?? '')
  for (const name of CARRIED) {
    for (const value of params.get(name) ?? []) query.append(name, value)
  }
  const text = query.toString()
  return text === '' ? APPLICATIONS_PATH : `${APPLICATIONS_PATH}?${text}`
}
