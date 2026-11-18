import type { DecisionOutcome } from '@/features/packs/schema'

export const OUTCOME_LABELS: Record<DecisionOutcome, string> = {
  approved: 'Approved',
  approved_with_conditions: 'Approved with conditions',
  denied: 'Denied',
  rehearing_granted: 'Rehearing granted',
  rehearing_denied: 'Rehearing denied',
}
