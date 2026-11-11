import { describe, expect, it } from 'vitest'
import { requesterEmailOf } from '@/features/rtk/requesterEmail'

describe('requesterEmailOf', () => {
  it('finds the one email address in the contact, lower cased', () => {
    expect(requesterEmailOf('Jordan@Example.test')).toBe('jordan@example.test')
    expect(requesterEmailOf('jordan@example.test, 603-555-0142')).toBe('jordan@example.test')
    expect(requesterEmailOf('Call 603-555-0142 or write jordan@example.test.')).toBe(
      'jordan@example.test',
    )
  })

  it('finds none when the contact has no address or more than one', () => {
    expect(requesterEmailOf(null)).toBeNull()
    expect(requesterEmailOf('')).toBeNull()
    expect(requesterEmailOf('12 Birch Lane, Alder Pond')).toBeNull()
    expect(requesterEmailOf('a@example.test or b@example.test')).toBeNull()
  })
})
