import { describe, expect, it } from 'vitest'
import { PAYMENT_ATTEMPT_STATES } from '@/db/schema/paymentAttempts'
import { LEDGER_ENTRY_TYPES, PAYMENT_METHODS } from '@/features/ledger/types'
import {
  attemptStateLabel,
  channelLabel,
  entryTypeLabel,
  methodLabel,
  transitionSentence,
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

  it('describes a transition as a sentence', () => {
    expect(transitionSentence('pending', 'captured', 'event')).toBe(
      'Moved from waiting for the processor to captured, reported by the processor.',
    )
    expect(transitionSentence('captured', 'voided', 'staff')).toBe(
      'Moved from captured to voided, by staff.',
    )
    expect(transitionSentence('pending', 'declined', 'reconcile')).toBe(
      'Moved from waiting for the processor to declined, found when checking with the processor.',
    )
    expect(transitionSentence('pending', 'captured', 'reader')).toBe(
      'Moved from waiting for the processor to captured, reported by the card reader.',
    )
  })
})
