import type { CoreState } from './states'

export type PanelKey =
  | 'reviewers'
  | 'board'
  | 'hearings'
  | 'completeness'
  | 'clocks'
  | 'notes'
  | 'activity'
  | 'conditions'
  | 'fees'
  | 'inspections'
  | 'documents'
  | 'parties'
  | 'edition'
  | 'regional'
  | 'appeals'
  | 'records'

const OUTCOME: readonly PanelKey[] = ['documents', 'inspections']
const REVIEW: readonly PanelKey[] = ['reviewers', 'completeness', 'clocks', 'fees']
const ISSUED: readonly PanelKey[] = ['inspections', 'conditions', 'fees', 'appeals']
const SUSPENDED: readonly PanelKey[] = ['appeals', 'inspections', 'conditions', 'fees']
const BOARD_BEFORE_DECISION: readonly PanelKey[] = ['board', 'hearings', 'clocks']

const PERMIT_PRIORITY: Record<CoreState, readonly PanelKey[]> = {
  draft: ['parties', 'fees', 'documents'],
  submitted: REVIEW,
  under_review: REVIEW,
  decided: ['conditions', 'fees', 'edition', 'regional'],
  issued: ISSUED,
  suspended: SUSPENDED,
  closed: OUTCOME,
  denied: OUTCOME,
  withdrawn: OUTCOME,
  expired: OUTCOME,
}

const BOARD_OUTCOME: readonly PanelKey[] = ['documents', 'hearings']

const BOARD_PRIORITY: Record<CoreState, readonly PanelKey[]> = {
  ...PERMIT_PRIORITY,
  draft: ['board', 'parties', 'fees'],
  submitted: BOARD_BEFORE_DECISION,
  under_review: BOARD_BEFORE_DECISION,
  decided: ['board', 'conditions', 'fees', 'hearings'],
  closed: BOARD_OUTCOME,
  denied: BOARD_OUTCOME,
  withdrawn: BOARD_OUTCOME,
  expired: BOARD_OUTCOME,
}

const HISTORY: readonly PanelKey[] = ['activity', 'records', 'parties']
const PERMIT_ORDER = new Map(Object.entries(PERMIT_PRIORITY))
const BOARD_ORDER = new Map(Object.entries(BOARD_PRIORITY))

export function panelPriority(state: CoreState, board: boolean): PanelKey[] {
  return [...((board ? BOARD_ORDER : PERMIT_ORDER).get(state) ?? [])]
}

export function historyPanels(state: CoreState, board: boolean): PanelKey[] {
  const lead = panelPriority(state, board)
  return HISTORY.filter((key) => !lead.includes(key))
}
