import { describe, expect, it } from 'vitest'
import { computeConvenienceFee } from '@/features/payments/convenienceFee'

const fee = { basisPoints: 300, fixedCents: 0, appliesTo: ['card_online', 'card_present'] as const }
const settings = { ...fee, appliesTo: [...fee.appliesTo] }

describe('computeConvenienceFee', () => {
  it('300 bps on 4500 is 135', () => {
    expect(computeConvenienceFee(4500, settings, 'card_online')).toBe(135)
  })

  it('300 bps on 4550 rounds 136.5 up to 137', () => {
    expect(computeConvenienceFee(4550, settings, 'card_present')).toBe(137)
  })

  it('cash pays no convenience fee', () => {
    expect(computeConvenienceFee(4500, settings, 'cash')).toBe(0)
    expect(computeConvenienceFee(4500, settings, 'check')).toBe(0)
  })

  it('fixed 30 plus 0 bps on 4500 is 30', () => {
    expect(
      computeConvenienceFee(4500, { ...settings, basisPoints: 0, fixedCents: 30 }, 'card_online'),
    ).toBe(30)
  })

  it('a channel not listed pays nothing', () => {
    expect(
      computeConvenienceFee(4500, { ...settings, appliesTo: ['card_online'] }, 'card_present'),
    ).toBe(0)
  })

  it('combines basis points and the fixed amount', () => {
    expect(
      computeConvenienceFee(1000, { ...settings, basisPoints: 250, fixedCents: 20 }, 'card_online'),
    ).toBe(45)
  })
})
