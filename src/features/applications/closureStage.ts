import type { ClosureStage } from './workPlanTypes'

export interface FinalRow {
  id: string
  isFinal: boolean
  status: 'requested' | 'scheduled' | 'passed' | 'failed' | 'cancelled'
  resultRecordedAt: Date | null
}

export interface ClosureOutcome {
  stage: ClosureStage
  reinspectId: string | null
}

const OPEN: readonly FinalRow['status'][] = ['requested', 'scheduled']

function recordedAt(row: FinalRow): number {
  return row.resultRecordedAt?.getTime() ?? 0
}

export function closureStage(
  rows: readonly FinalRow[],
  reinspectable: ReadonlySet<string>,
): ClosureOutcome {
  const finals = rows.filter((r) => r.isFinal)
  if (finals.some((r) => OPEN.includes(r.status))) return { stage: 'open', reinspectId: null }
  const latest = finals
    .filter((r) => r.status === 'passed' || r.status === 'failed')
    .sort((a, b) => recordedAt(a) - recordedAt(b))
    .at(-1)
  if (latest === undefined) return { stage: 'none', reinspectId: null }
  if (latest.status === 'passed') return { stage: 'passed', reinspectId: null }
  return { stage: 'failed', reinspectId: reinspectable.has(latest.id) ? latest.id : null }
}
