import type { Stage } from '@/components/layout/StageStrip'
import { type CoreState, isTerminalState, STATE_LABELS } from './states'
import { mainPath } from './workPath'

export type { Stage }

export interface StageInput {
  state: CoreState
  substep: string | null
  board: boolean
  allowsDirectIssue: boolean
  completeness: boolean
  receivedDate: string | null
  completedDate: string | null
  issuedOn: string | null
  overdue: boolean
}

interface Milestone {
  key: string
  label: string
  done: (input: StageInput, rank: number) => boolean
}

const FULL_PATH = mainPath({ allowsDirectIssue: false })
const RANKS = new Map<CoreState, number>([
  ...FULL_PATH.map((state, index): [CoreState, number] => [state, index]),
  ['suspended', FULL_PATH.indexOf('issued')],
  ['denied', FULL_PATH.indexOf('decided')],
])

function rankOf(state: CoreState): number {
  return RANKS.get(state) ?? 0
}

const reached = (state: CoreState) => (_: StageInput, rank: number) => rank >= rankOf(state)
const passed = (state: CoreState) => (_: StageInput, rank: number) => rank > rankOf(state)
const STAGE_NAMES = new Map<string, string>([
  ...Object.entries(STATE_LABELS),
  ['under_review', 'Review'],
])

function stageName(state: CoreState): string {
  return STAGE_NAMES.get(state) ?? state
}

function permitMilestone(state: CoreState): Milestone {
  const label = stageName(state)
  const activity = state === 'under_review'
  return { key: state, label, done: activity ? passed(state) : reached(state) }
}

const COMPLETE: Milestone = {
  key: 'complete',
  label: 'Complete',
  done: (input, rank) => input.completedDate !== null || rank >= rankOf('decided'),
}
const INSPECTIONS: Milestone = { key: 'inspections', label: 'Inspections', done: passed('issued') }

function permitMilestones(input: StageInput): Milestone[] {
  const path = mainPath(input).filter((state) => state !== 'draft')
  return path.flatMap((state) => {
    const stage = permitMilestone(state)
    if (state === 'submitted' && input.completeness) return [stage, COMPLETE]
    if (state === 'issued') return [stage, INSPECTIONS]
    return [stage]
  })
}

const BOARD_MILESTONES: Milestone[] = [
  { key: 'filed', label: 'Filed', done: reached('submitted') },
  { key: 'accepted', label: 'Accepted', done: reached('under_review') },
  {
    key: 'hearing',
    label: 'Hearing',
    done: (input, rank) =>
      rank >= rankOf('decided') ||
      (rank === rankOf('under_review') && input.substep === 'deliberation'),
  },
  { key: 'decision', label: 'Decision', done: reached('decided') },
  { key: 'appeal', label: 'Appeal period', done: reached('issued') },
]

function reachedRank(input: StageInput): number {
  if (input.issuedOn !== null) return rankOf('issued')
  if (input.completedDate !== null || input.receivedDate !== null) return rankOf('submitted')
  return rankOf('draft')
}

function outcomeOnly(input: StageInput): boolean {
  return (
    isTerminalState(input.state) &&
    input.state !== 'closed' &&
    !(input.board && input.state === 'denied')
  )
}

function marked(milestones: Milestone[], input: StageInput, rank: number): Stage[] {
  const firstOpen = milestones.findIndex((m) => !m.done(input, rank))
  return milestones.map((m, index) => {
    if (index < firstOpen || firstOpen === -1)
      return { key: m.key, label: m.label, status: 'done', overdue: false }
    const current = index === firstOpen
    return {
      key: m.key,
      label: m.label,
      status: current ? 'current' : 'upcoming',
      overdue: current && input.overdue,
    }
  })
}

function detour(stages: Stage[], input: StageInput): Stage[] {
  const onPath = stages.some((s) => s.key === input.state)
  const known =
    input.state === 'suspended' || (!input.board && !onPath && !isTerminalState(input.state))
  if (!known || input.state === 'draft') return stages
  const at = stages.findIndex((s) => s.status === 'current')
  const label = stageName(input.state)
  const inserted: Stage = { key: input.state, label, status: 'current', overdue: input.overdue }
  return [
    ...stages.slice(0, at),
    inserted,
    ...stages.slice(at).map((s): Stage => ({ ...s, status: 'upcoming', overdue: false })),
  ]
}

export function stagesFor(input: StageInput): Stage[] {
  const milestones = input.board ? BOARD_MILESTONES : permitMilestones(input)
  if (outcomeOnly(input)) {
    const done = marked(milestones, input, reachedRank(input)).filter((s) => s.status === 'done')
    const outcome: Stage = {
      key: input.state,
      label: stageName(input.state),
      status: 'current',
      overdue: false,
    }
    return [...done, outcome]
  }
  return detour(marked(milestones, input, rankOf(input.state)), input)
}
