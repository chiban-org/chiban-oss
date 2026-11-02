import type { AuditActor } from '@/features/audit/writeAudit'

export const LEDGER_ENTRY_TYPES = [
  'payment',
  'refund',
  'returned_check',
  'chargeback',
  'correction',
] as const
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number]

export const PAYMENT_METHODS = ['cash', 'check', 'card_present', 'card_online'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PROCESSORS = ['stripe', 'clover', 'simulated'] as const
export type Processor = (typeof PROCESSORS)[number]

export const ALLOCATION_TARGETS = ['fee_assessment_line', 'convenience_fee', 'overpayment'] as const
export type AllocationTarget = (typeof ALLOCATION_TARGETS)[number]

export type FeeStageKey = 'at_intake' | 'at_approval' | 'at_renewal' | 'at_notice'

export interface AllocationInput {
  targetKind: AllocationTarget
  applicationId?: string
  feeAssessmentId?: string
  stage?: FeeStageKey
  feeCode?: string
  amountCents: number
}

export type LedgerActor = Exclude<AuditActor, { kind: 'anonymous_public_intake' }>

export interface PostEntryInput {
  entryType: LedgerEntryType
  method: PaymentMethod
  amountCents: number
  postedAt: Date
  reversesEntryId?: string
  paymentAttemptId?: string
  processor?: { name: Processor; accountId: string; objectId: string }
  checkNumber?: string
  payerName: string
  payerUserId?: string
  reason?: string
  receiptId?: string
  processorReported?: boolean
  actor: LedgerActor
  allocations: AllocationInput[]
}
