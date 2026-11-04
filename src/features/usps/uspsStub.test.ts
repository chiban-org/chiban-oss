import { describe, expect, it } from 'vitest'
import { chooseLookup } from '@/features/usps/chooseLookup'
import { uspsStub } from '@/features/usps/uspsStub'

const signal = () => new AbortController().signal
const deps = {
  fetch: (() => Promise.reject(new Error('no network'))) as typeof fetch,
  now: () => 0,
}

describe('USPS stub', () => {
  it('answers like USPS: capitals, short street words and a ZIP+4', async () => {
    const result = await uspsStub.standardize(
      { streetAddress: '12 Osprey Lane', city: 'Alder Pond', state: 'NH' },
      signal(),
    )
    expect(result).toEqual({
      ok: true,
      value: {
        streetAddress: '12 OSPREY LN',
        secondaryAddress: '',
        city: 'ALDER POND',
        state: 'NH',
        ZIPCode: '03000',
        ZIPPlus4: '0012',
      },
    })
  })

  it('finds no match for a street named Nowhere', async () => {
    const result = await uspsStub.standardize(
      { streetAddress: '1 Nowhere Rd', ZIPCode: '03000' },
      signal(),
    )
    expect(result).toEqual({ ok: true, value: null })
  })

  it('waits for the caller to give up on a street named Slow', async () => {
    const controller = new AbortController()
    const pending = uspsStub.standardize(
      { streetAddress: '1 Slow Rd', ZIPCode: '03000' },
      controller.signal,
    )
    controller.abort()
    expect((await pending).ok).toBe(false)
  })
})

describe('chooseLookup', () => {
  const base = { USPS_STUB: false, USPS_API_BASE: 'https://apis.usps.com' }

  it('is off when no credentials are set', () => {
    expect(chooseLookup(base, deps)).toBeNull()
  })

  it('uses the stub when the stub is turned on', () => {
    expect(chooseLookup({ ...base, USPS_STUB: true }, deps)).toBe(uspsStub)
  })

  it('uses the USPS client when both credentials are set', () => {
    const lookup = chooseLookup(
      { ...base, USPS_CLIENT_ID: 'consumer-key', USPS_CLIENT_SECRET: 'consumer-secret' },
      deps,
    )
    expect(lookup).not.toBeNull()
    expect(lookup).not.toBe(uspsStub)
  })
})
