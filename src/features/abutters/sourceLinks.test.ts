import { describe, expect, it } from 'vitest'
import type { Provenance } from '@/features/abutters/resolution'
import { incompleteLines, sourceLines } from '@/features/abutters/sourceLinks'

const roster = (patch: Partial<Provenance>): Provenance => ({
  source: 'association_roster',
  ref: 'a1',
  asOf: '2027-02-01',
  ageDays: 0,
  state: 'fresh',
  ...patch,
})

describe('sourceLines', () => {
  it('links a roster source to its row on the tab of its kind', () => {
    expect(sourceLines([roster({})])).toEqual([
      {
        text: 'Association officer roster as of February 1, 2027',
        href: '/staff/notice-contacts?kind=associations&entry=a1#entry-a1',
      },
    ])
  })

  it('links a park tenant to the park it belongs to', () => {
    expect(sourceLines([roster({ source: 'park_roster', ref: 'p1:site-4' })])[0]?.href).toBe(
      '/staff/notice-contacts?kind=parks&entry=p1#entry-p1',
    )
  })

  it('links a restriction holder to the holders tab', () => {
    expect(sourceLines([roster({ source: 'restriction_roster', ref: 'h1' })])[0]?.href).toBe(
      '/staff/notice-contacts?kind=holders&entry=h1#entry-h1',
    )
  })

  it('leaves sources outside notice contacts as plain text', () => {
    expect(
      sourceLines([roster({ source: 'parcel_record', ref: 'parcel-1', state: 'fresh' })]),
    ).toEqual([{ text: 'Parcel layer', href: null }])
  })
})

describe('incompleteLines', () => {
  it('offers Add prefilled with the parcel for a condo with no association', () => {
    expect(
      incompleteLines(
        [
          {
            code: 'condo_roster_missing',
            detail: 'This parcel is a condominium with no association officer roster on file.',
            parcelId: 'c1',
          },
          { code: 'owner_missing', detail: 'The parcel record has no owner name.', parcelId: 'c2' },
        ],
        new Map([['c1', '009022000000']]),
      ),
    ).toEqual([
      {
        text: 'Parcel 009022000000 is a condominium with no association on file.',
        href: '/staff/notice-contacts?add=association&parcel=c1',
        linkText: 'Add its association',
      },
      { text: 'The parcel record has no owner name.', href: null, linkText: null },
    ])
  })
})
