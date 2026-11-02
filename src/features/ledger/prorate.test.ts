import { describe, expect, it } from 'vitest'
import { prorate } from '@/features/ledger/prorate'

describe('prorate', () => {
  it('prorate 1000 over 4500 and 135 is 971 and 29', () => {
    expect(
      prorate(1000, [
        { key: 'line', cents: 4500 },
        { key: 'fee', cents: 135 },
      ]),
    ).toEqual([
      { key: 'line', cents: 971 },
      { key: 'fee', cents: 29 },
    ])
  })

  it('prorate 1 over three equal weights gives the cent to the first', () => {
    expect(
      prorate(1, [
        { key: 'a', cents: 10 },
        { key: 'b', cents: 10 },
        { key: 'c', cents: 10 },
      ]),
    ).toEqual([
      { key: 'a', cents: 1 },
      { key: 'b', cents: 0 },
      { key: 'c', cents: 0 },
    ])
  })

  it('shares always sum exactly to the total', () => {
    const weights = [
      { key: 'a', cents: 333 },
      { key: 'b', cents: 777 },
      { key: 'c', cents: 1 },
      { key: 'd', cents: 4099 },
    ]
    for (const total of [1, 2, 99, 1000, 5210]) {
      const shares = prorate(total, weights)
      expect(shares.reduce((sum, s) => sum + s.cents, 0)).toBe(total)
    }
  })

  it('a total equal to the weights returns the weights', () => {
    expect(
      prorate(150, [
        { key: 'a', cents: 100 },
        { key: 'b', cents: 50 },
      ]),
    ).toEqual([
      { key: 'a', cents: 100 },
      { key: 'b', cents: 50 },
    ])
  })

  it('no weight is a programmer error', () => {
    expect(() => prorate(10, [])).toThrow()
    expect(() => prorate(10, [{ key: 'a', cents: 0 }])).toThrow()
  })
})
