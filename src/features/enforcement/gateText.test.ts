import { describe, expect, it } from 'vitest'
import { motionGateText } from '@/features/enforcement/gateText'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

describe('motionGateText', () => {
  it('says the motion can be filed when the gate is open and none was filed', () => {
    expect(motionGateText({ open: true }, null)).toBe('The motion to enforce can be filed.')
  })

  it('says the motion was filed once it has been, even though the gate is open', () => {
    expect(motionGateText({ open: true }, d('2027-03-23'))).toBe(
      'The motion to enforce was filed March 23, 2027.',
    )
  })

  it('lists every block in words with the filing lead date', () => {
    const text = motionGateText(
      { open: false, blocks: ['answer_period_running', { filingLeadUntil: d('2027-04-06') }] },
      null,
    )
    expect(text).toBe(
      'The motion to enforce cannot be filed yet. An answer period is still running. The motion can be filed no earlier than April 6, 2027, five days after filing with the clerk.',
    )
  })
})
