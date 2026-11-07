import { describe, expect, it } from 'vitest'
import { devSignInEntries } from './devSignInEntries'

describe('the dev sign-in list', () => {
  it('lists a person once with every role joined in role order', () => {
    const entries = devSignInEntries([
      { email: 'official@alderpond.example', name: 'Dana Booth', kind: 'staff', role: 'inspector' },
      { email: 'staff@alderpond.example', name: 'Sam Clerk', kind: 'staff', role: 'staff' },
      { email: 'official@alderpond.example', name: 'Dana Booth', kind: 'staff', role: 'staff' },
    ])
    expect(entries.map((e) => `${e.name} (${e.roles})`)).toEqual([
      'Dana Booth (staff, inspector)',
      'Sam Clerk (staff)',
    ])
  })
})
