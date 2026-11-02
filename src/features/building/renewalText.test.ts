import { describe, expect, it } from 'vitest'
import { renewedMessage } from '@/features/building/renewalText'
import { findIsoDates } from '@/test/leaks'

describe('renewedMessage', () => {
  it('names the new due date in words', () => {
    const text = renewedMessage('2027-12-31')
    expect(text).toBe('Renewed. The permit now runs to December 31, 2027.')
    expect(findIsoDates(text)).toEqual([])
  })
})
