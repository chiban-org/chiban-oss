import { describe, expect, it } from 'vitest'
import { cardReaderFor } from './cardReader'

describe('whether the counter card reader can take a payment', () => {
  it('is off with no card processor', () => {
    expect(cardReaderFor(null)).toEqual({
      available: false,
      reason: 'Card at the counter is off because no card processor is set up in Payment settings.',
    })
  })

  it('is off for Clover with no reader device', () => {
    expect(cardReaderFor({ processor: 'clover', settings: {} })).toEqual({
      available: false,
      reason:
        'Card at the counter is off because no card reader device is set up in Payment settings.',
    })
  })

  it('is off for a blank device id', () => {
    expect(cardReaderFor({ processor: 'clover', settings: { deviceId: '  ' } }).available).toBe(
      false,
    )
  })

  it('is on for Clover with a reader device', () => {
    expect(cardReaderFor({ processor: 'clover', settings: { deviceId: 'C031UQ' } })).toEqual({
      available: true,
      simulated: false,
    })
  })

  it('is on for Stripe with a reader device', () => {
    expect(cardReaderFor({ processor: 'stripe', settings: { deviceId: 'tmr_1' } }).available).toBe(
      true,
    )
  })

  it('is on, and says so, for the simulated processor', () => {
    expect(cardReaderFor({ processor: 'simulated', settings: {} })).toEqual({
      available: true,
      simulated: true,
    })
  })
})
