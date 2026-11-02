import type { AttemptState } from '@/db/schema/paymentAttempts'
import type { LedgerEntryType, PaymentMethod } from '@/features/ledger/types'
import { words } from '@/lib/words'

const ENTRY_TYPES: Record<LedgerEntryType, string> = {
  payment: 'Payment',
  refund: 'Refund',
  returned_check: 'Returned check',
  chargeback: 'Chargeback',
  correction: 'Correction',
}

const METHODS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  card_present: 'Card at the counter',
  card_online: 'Card online',
}

const CHANNELS = { card_online: 'Card online', card_present: 'Card at the counter' } as const

const STATES: Record<AttemptState, string> = {
  pending: 'Waiting for the processor',
  authorized: 'Authorized, not yet captured',
  captured: 'Captured',
  settled: 'Settled',
  declined: 'Declined',
  voided: 'Voided',
}

function lookup(table: Record<string, string>, key: string): string {
  return table[key] ?? words(key)
}

export const entryTypeLabel = (t: string): string => lookup(ENTRY_TYPES, t)
export const methodLabel = (m: string): string => lookup(METHODS, m)
export const channelLabel = (c: string): string => lookup(CHANNELS, c)
export const attemptStateLabel = (s: string): string => lookup(STATES, s)
