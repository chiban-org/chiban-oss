import { describe, expect, it } from 'vitest'
import { e2eDatabaseName } from './databaseName'

describe('the e2e database name', () => {
  it('keeps the New Hampshire name when no pack is chosen', () => {
    expect(e2eDatabaseName(4730, undefined)).toBe('chiban_e2e_4730')
    expect(e2eDatabaseName(4730, '')).toBe('chiban_e2e_4730')
    expect(e2eDatabaseName(4730, 'nh')).toBe('chiban_e2e_4730')
  })

  it('gives another pack its own database on the same port', () => {
    expect(e2eDatabaseName(3471, 'me')).toBe('chiban_e2e_me_3471')
    expect(e2eDatabaseName(3471, ' me ')).toBe('chiban_e2e_me_3471')
  })

  it('refuses a pack id that cannot be part of a database name', () => {
    expect(() => e2eDatabaseName(3471, 'me"; drop')).toThrow(/CHIBAN_PACK/)
  })
})
