import type { RetentionStatus } from '@/features/records/computeRetention'
import { formatCivilDate } from '@/lib/formatDate'

export function retentionText(status: RetentionStatus | null): string {
  if (status === null) return 'No record series assigned'
  if (status.state === 'permanent') return 'Permanent'
  if (status.state === 'eligible_on') return `Eligible ${formatCivilDate(status.date)}`
  return `Waiting for: ${status.awaiting.map((e) => e.replaceAll('_', ' ')).join(' or ')}`
}
