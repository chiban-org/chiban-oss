import type { WordingField } from '@/features/notifications/wording/wordingFields'

export const WORDING_KEYS = [
  'application_submitted',
  'fees_due',
  'payment_received',
  'application_issued',
  'application_denied',
  'inspection_scheduled',
  'inspection_cancelled',
  'inspection_result',
  'permit_corrected',
  'permit_corrected_contractor_removed',
  'review_assigned',
  'board_comment_requested',
  'clock_due_soon',
  'clock_overdue',
  'decision_filed',
] as const

export type WordingKey = (typeof WORDING_KEYS)[number]

export type WordingAudience = 'applicants' | 'staff' | 'reviewers' | 'boards'

interface WordingKeyInfo {
  label: string
  audience: WordingAudience
  fields: readonly WordingField[]
}

const INSPECTION: readonly WordingField[] = [
  'inspection.type',
  'inspection.date',
  'inspection.time',
]

export const WORDING_KEY_INFO: Record<WordingKey, WordingKeyInfo> = {
  application_submitted: { label: 'Application received', audience: 'applicants', fields: [] },
  fees_due: { label: 'Fees due', audience: 'applicants', fields: ['fees.amount'] },
  payment_received: {
    label: 'Payment received',
    audience: 'applicants',
    fields: ['receipt.number'],
  },
  application_issued: {
    label: 'Permit issued',
    audience: 'applicants',
    fields: ['account.from'],
  },
  application_denied: { label: 'Application denied', audience: 'applicants', fields: [] },
  inspection_scheduled: {
    label: 'Inspection scheduled',
    audience: 'applicants',
    fields: INSPECTION,
  },
  inspection_cancelled: {
    label: 'Inspection cancelled',
    audience: 'applicants',
    fields: ['inspection.type'],
  },
  inspection_result: {
    label: 'Inspection result',
    audience: 'applicants',
    fields: ['inspection.type', 'inspection.result'],
  },
  permit_corrected: {
    label: 'Permit corrected',
    audience: 'applicants',
    fields: ['permit.revision', 'account.in'],
  },
  permit_corrected_contractor_removed: {
    label: 'Permit corrected, contractor removed',
    audience: 'applicants',
    fields: ['permit.revision'],
  },
  review_assigned: { label: 'Review requested', audience: 'reviewers', fields: [] },
  board_comment_requested: {
    label: 'Board comments requested',
    audience: 'boards',
    fields: ['board.name', 'project.title', 'comments.by'],
  },
  clock_due_soon: {
    label: 'Deadline coming up',
    audience: 'staff',
    fields: ['clock.name', 'clock.due'],
  },
  clock_overdue: {
    label: 'Deadline passed',
    audience: 'staff',
    fields: ['clock.name', 'clock.due'],
  },
  decision_filed: {
    label: 'Board decision filed',
    audience: 'applicants',
    fields: ['board.name', 'decision.outcome', 'decision.filedOn', 'account.from'],
  },
}

export function isWordingKey(value: string): value is WordingKey {
  return (WORDING_KEYS as readonly string[]).includes(value)
}
