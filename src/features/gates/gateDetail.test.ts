import { describe, expect, it } from 'vitest'
import { gateDetail } from './gateDetail'

describe('gate detail', () => {
  it('drops the label when the reason starts with it', () => {
    expect(
      gateDetail(
        'Suspended by appeal (RSA 676:6)',
        'Suspended by appeal (RSA 676:6). Resolve the appeal first.',
      ),
    ).toBe('Resolve the appeal first.')
  })

  it('keeps a reason that does not repeat the label', () => {
    expect(gateDetail('Fees paid', 'Fees due: $50.00.')).toBe('Fees due: $50.00.')
  })

  it('returns nothing when the reason only repeats the label', () => {
    expect(gateDetail('Fees paid', 'Fees paid.')).toBe('')
  })
})
