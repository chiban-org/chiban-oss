import { describe, expect, it } from 'vitest'
import { feeChoices } from '@/features/fees/feeChoices'

describe('feeChoices', () => {
  it('names each fee by its label, once, from the preview or the assessments', () => {
    const lines = [
      { code: 'application', label: 'Application fee' },
      { code: 'notice_mail', label: 'Mailed notice to abutters' },
    ]
    expect(feeChoices(lines, [])).toEqual([
      ['application', 'Application fee'],
      ['notice_mail', 'Mailed notice to abutters'],
    ])
    expect(feeChoices(null, [{ lines }, { lines: lines.slice(0, 1) }])).toEqual([
      ['application', 'Application fee'],
      ['notice_mail', 'Mailed notice to abutters'],
    ])
  })
})
