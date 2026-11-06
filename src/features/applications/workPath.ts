import { CORE_TRANSITIONS, type CoreState, isTerminalState, isTransitionAllowed } from './states'

type Workflow = { allowsDirectIssue: boolean }

const TRANSITIONS = new Map(Object.entries(CORE_TRANSITIONS))
const DETOURS: readonly CoreState[] = ['suspended']
const BOARD_DECISIONS: readonly CoreState[] = ['decided']

export function nextOnPath(from: CoreState, workflow: Workflow): CoreState | null {
  const options = (TRANSITIONS.get(from) ?? []).filter(
    (to) => !DETOURS.includes(to) && isTransitionAllowed(from, to, workflow),
  )
  if (workflow.allowsDirectIssue && options.includes('issued')) return 'issued'
  return (
    options.find((to) => !isTerminalState(to)) ?? (options.includes('closed') ? 'closed' : null)
  )
}

export function mainPath(workflow: Workflow): CoreState[] {
  const path: CoreState[] = ['draft']
  for (let at = nextOnPath('draft', workflow); at !== null; at = nextOnPath(at, workflow)) {
    path.push(at)
    if (isTerminalState(at)) break
  }
  return path
}

export function requirementTargets(
  state: CoreState,
  workflow: Workflow,
  board: boolean,
): CoreState[] {
  if (state === 'draft' || isTerminalState(state)) return []
  if (state === 'suspended') return ['closed']
  const next = nextOnPath(state, workflow)
  if (next === null) return []
  if (board) return BOARD_DECISIONS.includes(next) ? [] : [next]
  const ahead = mainPath(workflow).slice(mainPath(workflow).indexOf(state) + 1)
  return next !== 'issued' && ahead.includes('issued') ? [next, 'issued'] : [next]
}
