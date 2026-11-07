import type { EnforcementStatus } from '@/db/schema'

export type CasePanelKey =
  | 'complaints'
  | 'notes'
  | 'findings'
  | 'orders'
  | 'appeals'
  | 'fines'
  | 'counsel'
  | 'documents'

const INVESTIGATION: readonly CasePanelKey[] = ['notes', 'complaints', 'findings']
const AFTER_COURT: readonly CasePanelKey[] = ['orders', 'documents']

const PRIORITY: Record<EnforcementStatus, readonly CasePanelKey[]> = {
  intake: INVESTIGATION,
  investigating: INVESTIGATION,
  violation_found: ['findings', 'documents'],
  no_violation: ['findings', 'notes', 'complaints'],
  order_issued: ['orders', 'documents'],
  in_court: ['orders', 'fines', 'counsel'],
  resolved: AFTER_COURT,
  closed: AFTER_COURT,
}

const ORDER = new Map(Object.entries(PRIORITY))

const AFTER_THE_ORDER: readonly EnforcementStatus[] = [
  'order_issued',
  'in_court',
  'resolved',
  'closed',
]
const HISTORY: readonly CasePanelKey[] = ['complaints', 'notes']

export function casePanelPriority(status: EnforcementStatus, stayed: boolean): CasePanelKey[] {
  const stage = ORDER.get(status) ?? []
  return stayed ? ['appeals', ...stage.filter((key) => key !== 'appeals')] : [...stage]
}

export function caseHistoryPanels(status: EnforcementStatus, stayed: boolean): CasePanelKey[] {
  if (!AFTER_THE_ORDER.includes(status)) return []
  const lead = casePanelPriority(status, stayed)
  return HISTORY.filter((key) => !lead.includes(key))
}
