import { describe, expect, it } from 'vitest'
import { PAYMENT_ATTEMPT_STATES } from '@/db/schema/paymentAttempts'
import { LEDGER_ENTRY_TYPES, PAYMENT_METHODS } from '@/features/ledger/types'
import {
  attemptStateLabel,
  channelLabel,
  entryTypeLabel,
  methodLabel,
} from '@/features/payments/labels'

describe('payment labels', () => {
  it('labels every ledger entry type, method, and attempt state in words', () => {
    for (const t of LEDGER_ENTRY_TYPES) expect(entryTypeLabel(t)).not.toMatch(/_/)
    for (const m of PAYMENT_METHODS) expect(methodLabel(m)).not.toMatch(/_/)
    for (const s of PAYMENT_ATTEMPT_STATES) expect(attemptStateLabel(s)).toMatch(/^[A-Z]/)
  })

  it('uses plain wording', () => {
    expect(entryTypeLabel('returned_check')).toBe('Returned check')
    expect(methodLabel('card_present')).toBe('Card at the counter')
    expect(channelLabel('card_online')).toBe('Card online')
    expect(attemptStateLabel('pending')).toBe('Waiting for the processor')
  })
})
