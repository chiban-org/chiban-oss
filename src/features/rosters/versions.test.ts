import { describe, expect, it } from 'vitest'
import { versionLines } from '@/features/rosters/versions'

describe('versionLines', () => {
  it('lists every officer with title and full mailing address', () => {
    expect(
      versionLines('association', {
        associationName: 'Heron Landing Condominium',
        officers: [
          {
            name: 'Dana Whitcomb',
            title: 'President',
            mailingAddress: 'PO Box 105, Alder Pond NH',
          },
        ],
        asOf: '2026-10-01',
      }),
    ).toEqual([
      'Heron Landing Condominium',
      'Dana Whitcomb, President, PO Box 105, Alder Pond NH',
      'Current as of October 1, 2026',
    ])
  })

  it('still reads entries written before full versions were kept', () => {
    expect(
      versionLines('park', { parkName: 'Heron Park', tenants: 2, asOf: '2026-10-01' }),
    ).toEqual(['Heron Park', '2 on the roster', 'Current as of October 1, 2026'])
  })

  it('shows a holder with its address, reference and ending', () => {
    expect(
      versionLines('restriction', {
        holdingId: 'h1',
        holderName: 'Alder Valley Land Trust',
        holderMailingAddress: '2 Trust Lane, Alder Pond NH',
        recordedReference: 'Book 412, Page 88',
        endedOn: '2026-10-01',
      }),
    ).toEqual([
      'Alder Valley Land Trust, 2 Trust Lane, Alder Pond NH',
      'Book 412, Page 88',
      'Ended October 1, 2026',
    ])
  })
})
