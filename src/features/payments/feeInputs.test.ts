import { describe, expect, it } from 'vitest'
import { convenienceExample } from '@/features/payments/feeInputs'

describe('convenience fee example', () => {
  it('works an example on a $100 payment', () => {
    expect(
      convenienceExample({ basisPoints: 300, fixedCents: 25, appliesTo: ['card_online'] }),
    ).toBe('On a $100.00 card payment the payer pays $3.25 more, $103.25 in all.')
    expect(convenienceExample({ basisPoints: 300, fixedCents: 0, appliesTo: [] })).toBe(
      'No convenience fee is charged.',
    )
  })
})
