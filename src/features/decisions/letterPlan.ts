import { addWarning, type WorkPlan } from '@/features/applications/workPlanTypes'
import type { LetterToMail } from '@/features/decisions/letterDelivery'

export function withLettersToMail(plan: WorkPlan, letters: readonly LetterToMail[]): WorkPlan {
  const unmailed = letters.filter((l) => l.mailedOn === null)
  if (unmailed.length === 0) return plan
  const names = unmailed.map((l) => l.partyName).join(', ')
  return addWarning(plan, {
    key: 'decision.letters_to_mail',
    text: `Mail the decision letter to ${names}.`,
  })
}
