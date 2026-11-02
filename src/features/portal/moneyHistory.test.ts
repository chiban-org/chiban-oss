import { describe, expect, it } from 'vitest'
import { moneyEntrySentence } from '@/features/portal/moneyHistory'
import type { PortalMoneyEntry } from '@/features/portal/portalView'

const base: PortalMoneyEntry = {
  entryId: 'e',
  entryType: 'payment',
  method: 'card_present',
  checkNumber: null,
  amountCents: 4635,
  convenienceCents: 135,
  date: '2026-06-01',
  receiptId: 'r',
  receiptNumber: 'R-2026-000004',
}

describe('moneyEntrySentence', () => {
  it('a card payment names the convenience fee it carried', () => {
    expect(moneyEntrySentence(base)).toBe(
      'June 1, 2026: paid $46.35 by card at the counter, including a $1.35 card convenience fee.',
    )
  })

  it('a refund reads as money given back, with its share of the convenience fee', () => {
    expect(
      moneyEntrySentence({
        ...base,
        entryType: 'refund',
        amountCents: -1000,
        convenienceCents: -29,
        date: '2026-06-02',
      }),
    ).toBe(
      'June 2, 2026: refunded $10.00 to the card, including $0.29 of the card convenience fee.',
    )
  })

  it('a returned check says the payment no longer counts', () => {
    expect(
      moneyEntrySentence({
        ...base,
        entryType: 'returned_check',
        method: 'check',
        checkNumber: '1048',
        amountCents: -4500,
        convenienceCents: 0,
        date: '2026-06-03',
      }),
    ).toBe(
      'June 3, 2026: check 1048 for $45.00 was returned by the bank, so it no longer counts as paid.',
    )
  })

  it('a check payment names the check number', () => {
    expect(
      moneyEntrySentence({
        ...base,
        method: 'check',
        checkNumber: '1048',
        amountCents: 4500,
        convenienceCents: 0,
      }),
    ).toBe('June 1, 2026: paid $45.00 by check 1048.')
  })

  it('a chargeback and a correction read plainly', () => {
    expect(moneyEntrySentence({ ...base, entryType: 'chargeback', amountCents: -4635 })).toBe(
      'June 1, 2026: the card payment of $46.35 was disputed, so it no longer counts as paid.',
    )
    expect(
      moneyEntrySentence({
        ...base,
        entryType: 'correction',
        amountCents: -500,
        convenienceCents: 0,
      }),
    ).toBe('June 1, 2026: the town moved $5.00 of a payment off this application.')
    expect(
      moneyEntrySentence({
        ...base,
        entryType: 'correction',
        amountCents: 500,
        convenienceCents: 0,
      }),
    ).toBe('June 1, 2026: the town moved $5.00 of a payment onto this application.')
  })
})
