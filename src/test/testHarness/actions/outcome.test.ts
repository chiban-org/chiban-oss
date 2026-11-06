import { describe, expect, it } from 'vitest'
import { HarnessNotFound, HarnessRedirect, settle } from './outcome'

describe('settle', () => {
  it('passes a returned value through', async () => {
    expect(await settle(Promise.resolve({ ok: true }))).toEqual({ ok: true })
  })

  it('turns a redirect into a value carrying its target', async () => {
    expect(await settle(Promise.reject(new HarnessRedirect('/staff/sign-in')))).toEqual({
      redirectsTo: '/staff/sign-in',
    })
  })

  it('turns notFound into a value', async () => {
    expect(await settle(Promise.reject(new HarnessNotFound()))).toEqual({ notFound: true })
  })

  it('rethrows anything else', async () => {
    await expect(settle(Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })

  it('keeps the message existing tests assert on', () => {
    expect(new HarnessRedirect('/x').message).toBe('NEXT_REDIRECT:/x')
  })
})
