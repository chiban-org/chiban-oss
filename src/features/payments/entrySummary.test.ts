import { describe, expect, it } from 'vitest'
import { entrySummary } from '@/features/payments/entrySummary'

describe('entrySummary', () => {
  it('writes the business date in words and the amount in dollars', () => {
    const text = entrySummary({
      businessDate: '2026-11-02',
      entryType: 'payment',
      method: 'card_online',
      checkNumber: null,
      amountCents: 12500,
      payerName: 'Alex Applicant',
    })
    expect(text).toBe('November 2, 2026, payment by card online: $125.00 from Alex Applicant.')
    expect(text).not.toContain('2026-11-02')
  })

  it('includes the check number', () => {
    const text = entrySummary({
      businessDate: '2026-11-02',
      entryType: 'payment',
      method: 'check',
      checkNumber: '1042',
      amountCents: 5000,
      payerName: 'Pat',
    })
    expect(text).toContain('by check 1042:')
  })
})
