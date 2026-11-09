import { type CoreState, isTerminalState } from '@/features/applications/states'
import { formatCents } from '@/lib/money'

export type HomeGroup = 'needs_you' | 'in_progress' | 'finished'

export interface HomeFacts {
  state: CoreState
  dueCents: number
  failedInspection: boolean
}

const WAITING: Partial<Record<CoreState, string>> = {
  submitted: 'Waiting on the town.',
  under_review: 'Waiting on the town.',
  decided: 'Approved. Waiting for the permit to be issued.',
  issued: 'Issued.',
  suspended: 'Suspended while an appeal is decided.',
  closed: 'Complete.',
  denied: 'Denied.',
  withdrawn: 'Withdrawn.',
  expired: 'Expired.',
}

export function homeGroup(facts: HomeFacts): HomeGroup {
  if (facts.state === 'draft' || facts.dueCents > 0 || facts.failedInspection) return 'needs_you'
  return isTerminalState(facts.state) ? 'finished' : 'in_progress'
}

export function homeNextStep(facts: HomeFacts): string {
  if (facts.state === 'draft') return 'Finish the form and submit it.'
  if (facts.dueCents > 0) return `Pay ${formatCents(facts.dueCents)}.`
  if (facts.failedInspection) {
    return 'An inspection failed. Request a reinspection when the work is fixed.'
  }
  return WAITING[facts.state] ?? ''
}
