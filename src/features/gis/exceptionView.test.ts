import { describe, expect, it } from 'vitest'
import { exceptionParcelId, ownerChangeRows } from '@/features/gis/exceptionView'

const HELD = {
  current: { ownerName: 'Quillfeather, Odessa', mailingAddress: 'PO Box 102, Alder Pond NH' },
  proposed: {
    ownerName: 'Marlowe Holdings LLC',
    siteAddress: '16 Heron Cove Road',
    mailingAddress: 'PO Box 102, Alder Pond NH',
  },
  parcelId: 'ff04c0f1-9282-49c6-a9ab-357f2b8f151a',
}

describe('ownerChangeRows', () => {
  it('lists the stored and incoming owner and mailing address', () => {
    expect(ownerChangeRows(HELD)).toEqual([
      {
        label: 'Owner',
        stored: 'Quillfeather, Odessa',
        incoming: 'Marlowe Holdings LLC',
        changed: true,
      },
      {
        label: 'Mailing address',
        stored: 'PO Box 102, Alder Pond NH',
        incoming: 'PO Box 102, Alder Pond NH',
        changed: false,
      },
    ])
  })

  it('says a value is blank instead of showing nothing', () => {
    const rows = ownerChangeRows({ current: { ownerName: null }, proposed: { ownerName: 'A' } })
    expect(rows[0]).toMatchObject({ stored: 'Blank', incoming: 'A', changed: true })
    expect(rows[1]).toMatchObject({ stored: 'Blank', incoming: 'Blank', changed: false })
  })

  it('returns no rows for a payload without owner values', () => {
    expect(ownerChangeRows({ value: '007001000000' })).toEqual([])
    expect(ownerChangeRows(null)).toEqual([])
  })
})

describe('exceptionParcelId', () => {
  it('reads the parcel a held row belongs to', () => {
    expect(exceptionParcelId(HELD)).toBe('ff04c0f1-9282-49c6-a9ab-357f2b8f151a')
  })

  it('is null when the payload names no parcel or a value that is not an id', () => {
    expect(exceptionParcelId({ properties: {} })).toBeNull()
    expect(exceptionParcelId({ parcelId: 'not-a-uuid' })).toBeNull()
  })
})
