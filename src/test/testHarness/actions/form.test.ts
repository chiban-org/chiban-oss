import { describe, expect, it } from 'vitest'
import { buildForm } from './form'

describe('buildForm', () => {
  it('sets each field, repeats array values, and skips undefined ones', () => {
    const f = buildForm({ a: 'x', n: 3, many: ['1', '2'], gone: undefined }, 'tok')
    expect([...f.entries()]).toEqual([
      ['csrf_token', 'tok'],
      ['a', 'x'],
      ['n', '3'],
      ['many', '1'],
      ['many', '2'],
    ])
  })

  it('omits the csrf field when the token is null', () => {
    expect(buildForm({ a: 'x' }, null).has('csrf_token')).toBe(false)
  })

  it('keeps a file as a file', () => {
    const file = new File(['hi'], 'a.txt', { type: 'text/plain' })
    expect(buildForm({ upload: file }, 'tok').get('upload')).toBeInstanceOf(File)
  })
})
