import { describe, expect, it } from 'vitest'
import { parseTypedAddress } from '@/features/usps/addressQuery'
import { buildSuggestion, readAddressResponse } from '@/features/usps/standardAddress'

const USPS_BODY = {
  firm: '',
  address: {
    streetAddress: '1 MAIN ST',
    streetAddressAbbreviation: '1 MAIN ST',
    secondaryAddress: '',
    cityAbbreviation: 'ALDER POND',
    city: 'ALDER POND',
    state: 'NH',
    ZIPCode: '03000',
    ZIPPlus4: '1234',
    urbanization: '',
  },
  additionalInfo: { deliveryPoint: '01', carrierRoute: 'C001', DPVConfirmation: 'Y' },
  corrections: [{ code: '', text: '' }],
  matches: [{ code: '31', text: 'Single Response - exact match' }],
}

function typed(lines: string[]) {
  const parsed = parseTypedAddress(lines)
  if (parsed === null) throw new Error('fixture did not parse')
  return parsed
}

describe('readAddressResponse', () => {
  it('reads the standardized address from a USPS answer', () => {
    expect(readAddressResponse(USPS_BODY)).toEqual({
      streetAddress: '1 MAIN ST',
      secondaryAddress: '',
      city: 'ALDER POND',
      state: 'NH',
      ZIPCode: '03000',
      ZIPPlus4: '1234',
    })
  })

  it('accepts a null ZIP+4 and rejects an answer with no address', () => {
    const noPlus4 = { address: { ...USPS_BODY.address, ZIPPlus4: null } }
    expect(readAddressResponse(noPlus4)?.ZIPPlus4).toBeNull()
    expect(readAddressResponse({ firm: '' })).toBeNull()
    expect(readAddressResponse('not json')).toBeNull()
  })
})

describe('buildSuggestion', () => {
  const standard = readAddressResponse(USPS_BODY)
  if (standard === null) throw new Error('fixture did not read')

  it('suggests the USPS lines and says they differ from what was typed', () => {
    expect(buildSuggestion(typed(['1 Main Street, Alder Pond NH 03000']), standard)).toEqual({
      lines: ['1 MAIN ST', 'ALDER POND NH 03000-1234'],
      matches: false,
    })
  })

  it('matches when the typed address is the USPS address in any case and punctuation', () => {
    const suggestion = buildSuggestion(typed(['1 Main St.', 'Alder Pond, NH 03000-1234']), standard)
    expect(suggestion.matches).toBe(true)
  })

  it('keeps the preamble lines in front of the USPS lines', () => {
    const suggestion = buildSuggestion(
      typed(['Land Use Office', '1 Main Street', 'Alder Pond NH']),
      standard,
    )
    expect(suggestion.lines).toEqual(['Land Use Office', '1 MAIN ST', 'ALDER POND NH 03000-1234'])
  })

  it('adds a unit USPS returns separately to the street line once', () => {
    const withUnit = { ...standard, secondaryAddress: 'APT 2' }
    expect(buildSuggestion(typed(['1 Main St, Apt 2, 03000']), withUnit).lines[0]).toBe(
      '1 MAIN ST APT 2',
    )
    const already = { ...standard, streetAddress: '1 MAIN ST APT 2', secondaryAddress: 'APT 2' }
    expect(buildSuggestion(typed(['1 Main St, Apt 2, 03000']), already).lines[0]).toBe(
      '1 MAIN ST APT 2',
    )
  })
})
