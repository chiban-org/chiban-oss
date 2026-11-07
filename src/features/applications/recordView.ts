import type { CoreState } from './states'

export interface RecordViewInput {
  recordsInspections: boolean
  managesWorkflow: boolean
  issuesPermits: boolean
  state: CoreState
  inspectionCount: number
}

export type RecordView = 'inspector' | 'office'

export function recordViewFor(input: RecordViewInput): RecordView {
  if (!input.recordsInspections || input.managesWorkflow || input.issuesPermits) return 'office'
  return input.state === 'issued' || input.inspectionCount > 0 ? 'inspector' : 'office'
}
