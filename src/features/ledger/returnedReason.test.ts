import { describe, expect, it } from 'vitest'
import { returnedCheckReason } from '@/features/ledger/returnedReason'
import { findIsoDates } from '@/test/leaks'

describe('returnedCheckReason', () => {
  it('writes the returned date in words', () => {
    const text = returnedCheckReason('2027-03-05', 'Insufficient funds notice')
    expect(text).toBe('Returned March 5, 2027: Insufficient funds notice')
    expect(findIsoDates(text)).toEqual([])
  })
})
