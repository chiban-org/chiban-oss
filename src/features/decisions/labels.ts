import type { DecisionOutcome } from '@/features/packs/schema'
import { rehearingWords } from '@/features/packs/vocabulary'

export const OUTCOME_LABELS: Record<DecisionOutcome, string> = {
  approved: 'Approved',
  approved_with_conditions: 'Approved with conditions',
  denied: 'Denied',
  get rehearing_granted() {
    return `${rehearingWords().capitalised} granted`
  },
  get rehearing_denied() {
    return `${rehearingWords().capitalised} denied`
  },
}
