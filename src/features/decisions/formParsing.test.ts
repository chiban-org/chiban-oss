import { describe, expect, it } from 'vitest'
import { parseConditions, parseVotes } from '@/features/decisions/formParsing'

describe('parseVotes', () => {
  it('counts for, against, and abstain and leaves recused out of the totals', () => {
    expect(
      parseVotes(
        'Avery Stone: for\nRobin Vale: for\nDrew Hale: against\nSam Pike: recused\nLee Moss: abstain',
      ),
    ).toEqual({
      for: 2,
      against: 1,
      abstain: 1,
      members: [
        { name: 'Avery Stone', vote: 'for' },
        { name: 'Robin Vale', vote: 'for' },
        { name: 'Drew Hale', vote: 'against' },
        { name: 'Sam Pike', vote: 'recused' },
        { name: 'Lee Moss', vote: 'abstain' },
      ],
    })
  })

  it('accepts a dash or colon and any letter case', () => {
    expect(parseVotes('Avery Stone - FOR')?.for).toBe(1)
  })

  it('refuses a line with an unknown vote or no name, and refuses an empty list', () => {
    expect(parseVotes('Avery Stone: maybe')).toBeNull()
    expect(parseVotes(': for')).toBeNull()
    expect(parseVotes('  \n ')).toBeNull()
  })
})

describe('parseConditions', () => {
  it('numbers the conditions and marks those that come before issuance', () => {
    expect(parseConditions('Before issuance: File a survey.\nShield all lights.')).toEqual([
      { code: 'C1', text: 'File a survey.', precedent: true },
      { code: 'C2', text: 'Shield all lights.', precedent: false },
    ])
  })

  it('returns none for blank input', () => {
    expect(parseConditions('  \n')).toEqual([])
  })
})
