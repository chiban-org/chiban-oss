import { describe, expect, it } from 'vitest'
import { changedTables } from './writes'

describe('changedTables', () => {
  it('names tables whose digest moved, appeared, or vanished, sorted', () => {
    const before = new Map([
      ['users', 'a'],
      ['audit_log', 'b'],
      ['gone', 'c'],
    ])
    const after = new Map([
      ['users', 'a'],
      ['audit_log', 'B'],
      ['added', 'd'],
    ])
    expect(changedTables(before, after)).toEqual(['added', 'audit_log', 'gone'])
  })
})
