import type { Status } from '@/features/design/tokens'

const REVIEW_STATUS_LABELS = new Map<string, string>([
  ['pending', 'Pending'],
  ['commented', 'Commented'],
  ['signed_off', 'Signed off'],
])

export function reviewStatusLabel(status: string): string {
  return REVIEW_STATUS_LABELS.get(status) ?? status
}

export function reviewChipStatus(status: string, overdue = false): Status {
  if (overdue) return 'overdue'
  return status === 'signed_off' ? 'passed' : 'neutral'
}
