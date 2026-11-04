import { describe, expect, it } from 'vitest'
import { convenienceExample, parseFeeInputs, percentText } from '@/features/payments/feeInputs'

describe('convenience fee inputs', () => {
  it('reads a percent and a dollar amount into basis points and cents', () => {
    expect(parseFeeInputs('2.5', '0.30')).toEqual({ ok: true, basisPoints: 250, fixedCents: 30 })
    expect(parseFeeInputs('', '')).toEqual({ ok: true, basisPoints: 0, fixedCents: 0 })
    expect(percentText(250)).toBe('2.5')
  })

  it('names the field and says how to fix it', () => {
    expect(parseFeeInputs('three', '0')).toMatchObject({ ok: false, field: 'percent' })
    expect(parseFeeInputs('101', '0')).toMatchObject({ ok: false, field: 'percent' })
    expect(parseFeeInputs('1', '1.234')).toMatchObject({ ok: false, field: 'fixedDollars' })
  })

  it('works an example on a $100 payment', () => {
    expect(
      convenienceExample({ basisPoints: 300, fixedCents: 25, appliesTo: ['card_online'] }),
    ).toBe('On a $100.00 card payment the payer pays $3.25 more, $103.25 in all.')
    expect(convenienceExample({ basisPoints: 300, fixedCents: 0, appliesTo: [] })).toBe(
      'No convenience fee is charged.',
    )
  })
})
