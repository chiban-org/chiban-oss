import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { optionalEmail } from './optionalEmail'

const schema = optionalEmail('your email')

describe('optionalEmail', () => {
  it('reads a blank, a missing and a whitespace-only value as not given', () => {
    expect(schema.parse('')).toBeNull()
    expect(schema.parse(undefined)).toBeNull()
    expect(schema.parse('   ')).toBeNull()
  })

  it('accepts an object that leaves the key out', () => {
    expect(z.object({ email: schema }).parse({})).toEqual({ email: null })
  })

  it('keeps a trimmed address', () => {
    expect(schema.parse(' pat@example.test ')).toBe('pat@example.test')
  })

  it('names the field noun for a bad address', () => {
    const result = schema.safeParse('not-an-email')
    expect(result.success ? [] : result.error.issues.map((i) => i.message)).toEqual([
      'Enter your email like name@example.com.',
    ])
  })
})
