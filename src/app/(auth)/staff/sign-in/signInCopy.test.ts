import { describe, expect, it } from 'vitest'
import { signInFailureMessage } from './signInCopy'

describe('signInFailureMessage', () => {
  it('names only the fields the person filled in', () => {
    expect(signInFailureMessage(false)).toBe('Email or password is incorrect.')
    expect(signInFailureMessage(true)).toBe('Email, password, or code is incorrect.')
  })
})
