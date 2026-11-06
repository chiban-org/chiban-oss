import { describe, expect, it } from 'vitest'
import { mainPath, requirementTargets } from './workPath'

const BUILDING = { allowsDirectIssue: false }
const TRADE = { allowsDirectIssue: true }

describe('the path through the workflow', () => {
  it('walks a building permit through review and decision to issuance and closing', () => {
    expect(mainPath(BUILDING)).toEqual([
      'draft',
      'submitted',
      'under_review',
      'decided',
      'issued',
      'closed',
    ])
  })

  it('walks a trade permit straight from submission to issuance', () => {
    expect(mainPath(TRADE)).toEqual(['draft', 'submitted', 'issued', 'closed'])
  })
})

describe('which requirements the record lists', () => {
  it.each([
    ['submitted', ['under_review', 'issued']],
    ['under_review', ['decided', 'issued']],
    ['decided', ['issued']],
    ['issued', ['closed']],
    ['suspended', ['closed']],
    ['draft', []],
    ['closed', []],
    ['withdrawn', []],
  ] as const)('lists a building permit in %s against %j', (state, targets) => {
    expect(requirementTargets(state, BUILDING, false)).toEqual(targets)
  })

  it('lists issuance blockers for a trade permit that is still under review', () => {
    expect(requirementTargets('under_review', TRADE, false)).toEqual(['decided', 'issued'])
  })

  it('lists a board application against the hearing, never against the board decision', () => {
    expect(requirementTargets('submitted', BUILDING, true)).toEqual(['under_review'])
    expect(requirementTargets('under_review', BUILDING, true)).toEqual([])
    expect(requirementTargets('decided', BUILDING, true)).toEqual(['issued'])
  })
})
