import { describe, expect, it } from 'vitest'
import { parseTypedAddress } from '@/features/usps/addressQuery'

describe('parseTypedAddress', () => {
  it('reads one line with the city, state and ZIP after the last comma', () => {
    expect(parseTypedAddress(['12 Osprey Lane, Alder Pond NH 03999'])).toEqual({
      preamble: [],
      query: { streetAddress: '12 Osprey Lane', city: 'Alder Pond', state: 'NH', ZIPCode: '03999' },
    })
  })

  it('reads a city and state with no ZIP', () => {
    expect(parseTypedAddress(['12 Alder Lane, Alder Pond NH'])?.query).toEqual({
      streetAddress: '12 Alder Lane',
      city: 'Alder Pond',
      state: 'NH',
    })
  })

  it('reads the state and ZIP after their own comma, with a ZIP+4', () => {
    expect(parseTypedAddress(['1 Main St, Alder Pond, nh 03000-1234'])?.query).toEqual({
      streetAddress: '1 Main St',
      city: 'Alder Pond',
      state: 'NH',
      ZIPCode: '03000',
      ZIPPlus4: '1234',
    })
  })

  it('reads a street and a ZIP alone', () => {
    expect(parseTypedAddress(['1 Main St, 03000'])?.query).toEqual({
      streetAddress: '1 Main St',
      ZIPCode: '03000',
    })
  })

  it('keeps a unit between the street and the city as the secondary address', () => {
    expect(parseTypedAddress(['1 Main St, Apt 2, Alder Pond NH 03000'])?.query).toEqual({
      streetAddress: '1 Main St',
      secondaryAddress: 'Apt 2',
      city: 'Alder Pond',
      state: 'NH',
      ZIPCode: '03000',
    })
  })

  it('keeps whole lines before the street line as the preamble', () => {
    expect(
      parseTypedAddress(['Land Use Office, Town Hall', '1 Main Street', 'Alder Pond, NH 03000']),
    ).toEqual({
      preamble: ['Land Use Office, Town Hall'],
      query: { streetAddress: '1 Main Street', city: 'Alder Pond', state: 'NH', ZIPCode: '03000' },
    })
  })

  it('keeps parts before the street on the same line as one preamble entry', () => {
    expect(parseTypedAddress(['Attn Clerk, 1 Main St, Alder Pond NH 03000'])?.preamble).toEqual([
      'Attn Clerk',
    ])
  })

  it('takes the street nearest the city line when an earlier line also starts with a number', () => {
    expect(
      parseTypedAddress(['2nd Floor, Town Hall', '1 Main Street', 'Alder Pond NH 03000']),
    ).toEqual({
      preamble: ['2nd Floor, Town Hall'],
      query: { streetAddress: '1 Main Street', city: 'Alder Pond', state: 'NH', ZIPCode: '03000' },
    })
  })

  it('keeps a numbered unit after the street on the same line as the secondary address', () => {
    expect(parseTypedAddress(['1 Main St, 2nd Floor, Alder Pond NH'])?.query).toEqual({
      streetAddress: '1 Main St',
      secondaryAddress: '2nd Floor',
      city: 'Alder Pond',
      state: 'NH',
    })
  })

  it('reads an address typed with no commas, as CAMA imports join it', () => {
    expect(parseTypedAddress(['1 Main St Alder Pond NH 03000'])?.query).toEqual({
      streetAddress: '1 Main St',
      city: 'Alder Pond',
      state: 'NH',
      ZIPCode: '03000',
    })
    expect(parseTypedAddress(['12 Birch Hollow Road Alder Pond NH'])?.query).toEqual({
      streetAddress: '12 Birch Hollow Road',
      city: 'Alder Pond',
      state: 'NH',
    })
  })

  it('splits the city off a street line when the state and ZIP have their own comma', () => {
    expect(parseTypedAddress(['1 Main St Alder Pond, NH 03000'])?.query).toEqual({
      streetAddress: '1 Main St',
      city: 'Alder Pond',
      state: 'NH',
      ZIPCode: '03000',
    })
  })

  it('sends the whole street with the ZIP when no street word marks where the city starts', () => {
    expect(parseTypedAddress(['14 Birchwood 03000'])?.query).toEqual({
      streetAddress: '14 Birchwood',
      ZIPCode: '03000',
    })
  })

  it('keeps a numbered floor line after the street as the secondary address', () => {
    expect(parseTypedAddress(['1 Main St', '2nd Floor', 'Alder Pond NH 03000'])).toEqual({
      preamble: [],
      query: {
        streetAddress: '1 Main St',
        secondaryAddress: '2nd Floor',
        city: 'Alder Pond',
        state: 'NH',
        ZIPCode: '03000',
      },
    })
  })

  it('reads a post office box as a street line', () => {
    expect(parseTypedAddress(['PO Box 7', 'Alder Pond NH 03000'])?.query.streetAddress).toBe(
      'PO Box 7',
    )
  })

  it('returns null for text that is not a mailing address', () => {
    expect(parseTypedAddress(['clerk@alderpond.example'])).toBeNull()
    expect(parseTypedAddress(['603-555-0100'])).toBeNull()
    expect(parseTypedAddress(['Alder Pond NH 03000'])).toBeNull()
    expect(parseTypedAddress(['12 Alder Lane'])).toBeNull()
    expect(parseTypedAddress(['2nd Floor Alder Pond NH 03000'])).toBeNull()
    expect(parseTypedAddress(['12 Alder Lane, Alder Pond'])).toBeNull()
    expect(parseTypedAddress(['', '  '])).toBeNull()
  })

  it('returns null for a state code USPS does not list', () => {
    expect(parseTypedAddress(['12 Alder Lane, Alder Pond ZZ'])).toBeNull()
  })
})
