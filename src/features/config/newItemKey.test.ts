import { describe, expect, it } from 'vitest'
import { newItemKey, prefixFromLabel } from '@/features/config/newItemKey'

describe('new item short names', () => {
  it('makes a short name from the name', () => {
    expect(newItemKey('Fence permit fees', '', new Set())).toEqual({
      ok: true,
      key: 'fence-permit-fees',
    })
  })

  it('numbers a short name that is taken', () => {
    const taken = new Set(['fence', 'fence-2'])
    expect(newItemKey('Fence', '', taken)).toEqual({ ok: true, key: 'fence-3' })
  })

  it('uses a typed short name, refusing one that is taken or malformed', () => {
    expect(newItemKey('Anything', 'my.key', new Set())).toEqual({ ok: true, key: 'my.key' })
    expect(newItemKey('Anything', 'my.key', new Set(['my.key']))).toMatchObject({
      ok: false,
      field: 'key',
    })
    expect(newItemKey('Anything', 'Bad Key!', new Set())).toMatchObject({ ok: false, field: 'key' })
  })

  it('asks for a name', () => {
    expect(newItemKey('  ', '', new Set())).toEqual({
      ok: false,
      field: 'label',
      message: 'Enter a name.',
    })
  })

  it('suggests a number prefix from the initials', () => {
    expect(prefixFromLabel('Fence permit')).toBe('FP')
    expect(prefixFromLabel('Use of a pond')).toBe('UP')
    expect(prefixFromLabel('')).toBe('XX')
  })
})
