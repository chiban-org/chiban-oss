import { describe, expect, it } from 'vitest'
import { devSignInEntries } from './devSignInEntries'

describe('the dev sign-in list', () => {
  it('lists a person once with every role joined in role order', () => {
    const entries = devSignInEntries([
      { email: 'official@alderpond.example', name: 'Dana Booth', kind: 'staff', role: 'inspector' },
      { email: 'staff@alderpond.example', name: 'Sam Clerk', kind: 'staff', role: 'staff' },
      { email: 'official@alderpond.example', name: 'Dana Booth', kind: 'staff', role: 'staff' },
    ])
    expect(entries.map((e) => e.label)).toEqual([
      'Dana Booth (staff, inspector)',
      'Sam Clerk (staff)',
    ])
  })

  it('names the boards a member sits on after the roles', () => {
    const entries = devSignInEntries(
      [
        {
          email: 'concom.member@alderpond.example',
          name: 'Cleo Marsh',
          kind: 'public',
          role: 'board_member',
        },
        { email: 'staff@alderpond.example', name: 'Sam Clerk', kind: 'staff', role: 'staff' },
      ],
      new Map([['concom.member@alderpond.example', ['Conservation Commission']]]),
    )
    expect(entries.map((e) => e.label)).toEqual([
      'Cleo Marsh (board_member, Conservation Commission)',
      'Sam Clerk (staff)',
    ])
  })
})
