import { describe, expect, it } from 'vitest'
import type { ParcelHistory } from '@/features/parcels/parcelHistory'
import { withoutParcelFiles } from '@/features/parcels/withoutParcelFiles'

const base = {
  kind: 'document',
  recordId: 'd1',
  title: 'Deed',
  number: 'Parcel file',
  status: { label: 'Private', chip: 'neutral' as const },
  date: null,
  href: null,
}

describe('withoutParcelFiles', () => {
  it('drops parcel files and the groups they leave empty', () => {
    const permit = { ...base, kind: 'application', recordId: 'a1', title: 'Deck permit' }
    const history: ParcelHistory = {
      own: [{ ...base, parcelFile: true }, permit],
      ancestral: [
        { parcelId: 'p1', displayId: 'x', label: 'l1', records: [{ ...base, parcelFile: true }] },
        { parcelId: 'p2', displayId: 'y', label: 'l2', records: [permit] },
      ],
      sourcesRegistered: 2,
    }
    const filtered = withoutParcelFiles(history)
    expect(filtered.own.map((r) => r.title)).toEqual(['Deck permit'])
    expect(filtered.ancestral.map((g) => g.parcelId)).toEqual(['p2'])
    expect(filtered.sourcesRegistered).toBe(2)
  })
})
