import { describe, expect, it } from 'vitest'
import { requiredDecisionFields } from '@/features/decisions/requiredFields'
import { loadPack } from '@/features/packs/loadPack'

function rule() {
  const found = loadPack().rules.find((r) => r.key === 'nh.board.written_decision')
  if (found === undefined || found.kind !== 'required_record') throw new Error('missing rule')
  return found
}

describe('requiredDecisionFields', () => {
  it('an approval needs findings only', () => {
    expect(requiredDecisionFields(rule(), 'approved')).toEqual(['findings'])
  })

  it('an approval with conditions needs findings and conditions', () => {
    expect(requiredDecisionFields(rule(), 'approved_with_conditions')).toEqual([
      'findings',
      'conditions',
    ])
  })

  it('a denial needs findings and reasons for disapproval', () => {
    expect(requiredDecisionFields(rule(), 'denied')).toEqual(['findings', 'reasonsForDisapproval'])
  })

  it('a rehearing outcome needs findings only', () => {
    expect(requiredDecisionFields(rule(), 'rehearing_denied')).toEqual(['findings'])
  })
})
