import { describe, expect, it } from 'vitest'
import { leadWith, sameAddress } from './addressMatch'
import type { SearchGroup } from './searchTypes'

function groupOf(key: SearchGroup['key']): SearchGroup {
  return { key, label: key, rows: [], seeAll: null }
}

describe('address match', () => {
  it('treats case and runs of spaces as the same address', () => {
    expect(sameAddress('12 Heron Cove Road', '  12  heron cove ROAD ')).toBe(true)
  })

  it('does not treat part of an address as the address', () => {
    expect(sameAddress('112 Heron Cove Road', '12 Heron Cove Road')).toBe(false)
    expect(sameAddress('12 Heron Cove Road', 'Heron Cove Road')).toBe(false)
    expect(sameAddress(null, '12 Heron Cove Road')).toBe(false)
  })

  it('moves the named group first and keeps the others in order', () => {
    const groups = ['applications', 'cases', 'parcels', 'requests'].map((k) =>
      groupOf(k as SearchGroup['key']),
    )
    expect(leadWith('parcels', groups).map((g) => g.key)).toEqual([
      'parcels',
      'applications',
      'cases',
      'requests',
    ])
  })

  it('leaves the groups alone when the named group is absent', () => {
    const groups = [groupOf('applications'), groupOf('cases')]
    expect(leadWith('parcels', groups)).toEqual(groups)
  })
})
