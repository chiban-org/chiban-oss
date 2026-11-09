import { describe, expect, it } from 'vitest'
import type { WorkPlan } from '@/features/applications/workPlanTypes'
import type { LetterToMail } from '@/features/decisions/letterDelivery'
import { withLettersToMail } from '@/features/decisions/letterPlan'

const PLAN: WorkPlan = {
  state: 'decided',
  sentence: 'Waiting on: Town. Record final approval.',
  now: {
    key: 'final',
    task: 'Record final approval',
    actor: 'town',
    note: null,
    action: null,
    secondary: [],
    warnings: [],
  },
  groups: [],
  terminal: [],
}

const letter = (partyName: string, mailedOn: string | null): LetterToMail => ({
  id: partyName,
  partyName,
  partyRole: 'agent',
  documentId: 'doc',
  documentTitle: 'Decision letter',
  mailedOn,
})

describe('withLettersToMail', () => {
  it('warns in the card while a decision letter is still to be mailed', () => {
    const plan = withLettersToMail(PLAN, [
      letter('Pat Paper', null),
      letter('Mo Mailed', '2027-07-12'),
    ])
    expect(plan.now?.warnings).toEqual([
      {
        key: 'decision.letters_to_mail',
        text: 'Mail the decision letter to Pat Paper.',
      },
    ])
  })

  it('adds nothing once every letter is mailed', () => {
    expect(withLettersToMail(PLAN, [letter('Mo Mailed', '2027-07-12')])).toBe(PLAN)
  })
})
