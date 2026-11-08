import { describe, expect, it } from 'vitest'
import { findingUses, mayEditFinding } from './findingUses'

const detail = {
  notices: [{ findingIds: ['f1'], sentOn: '2026-10-03' }],
  orders: [
    {
      row: {
        findingIds: ['f1', 'f2'],
        number: 'CD-2026-0001',
        status: 'draft' as const,
        issuedOn: null,
      },
    },
    {
      row: {
        findingIds: ['f2'],
        number: 'CD-2026-0002',
        status: 'issued' as const,
        issuedOn: '2026-10-10',
      },
    },
  ],
}

describe('where a finding already appears', () => {
  it('names each notice and order that includes it', () => {
    const uses = findingUses(detail)
    expect(uses.get('f1')).toEqual([
      'In the notice sent October 3, 2026',
      'In draft order CD-2026-0001',
    ])
    expect(uses.get('f2')).toEqual([
      'In draft order CD-2026-0001',
      'In order CD-2026-0002, issued October 10, 2026',
    ])
    expect(uses.get('f3')).toBeUndefined()
  })

  it('allows editing only an open finding no notice or order uses', () => {
    const uses = findingUses(detail)
    expect(mayEditFinding({ id: 'f3', status: 'open' }, uses)).toBe(true)
    expect(mayEditFinding({ id: 'f1', status: 'open' }, uses)).toBe(false)
    expect(mayEditFinding({ id: 'f3', status: 'corrected' }, uses)).toBe(false)
  })
})
