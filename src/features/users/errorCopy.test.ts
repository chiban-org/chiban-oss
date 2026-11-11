import { describe, expect, it } from 'vitest'
import { unsentCopy } from '@/features/users/errorCopy'

describe('unsentCopy', () => {
  it('sends the person to whoever runs the server, not to a screen that does not exist', () => {
    const copy = unsentCopy('The account was created.')
    expect(copy).toBe(
      'The account was created. The email could not be sent. Ask whoever runs the server to check the mail settings, then send it again.',
    )
    expect(copy).not.toContain('Health')
  })
})
