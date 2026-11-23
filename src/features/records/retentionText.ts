import type { RecordEventKind } from '@/features/packs/schema'
import type { RetentionStatus } from '@/features/records/computeRetention'
import { formatCivilDate } from '@/lib/formatDate'

const EVENT_TEXT: ReadonlyMap<RecordEventKind, string> = new Map([
  ['application_withdrawn', 'the application is withdrawn'],
  ['application_denied', 'the application is denied'],
  ['building_removed', 'the building is removed'],
  ['registration_expired', 'the registration expires'],
  ['septic_replaced_or_removed', 'the septic system is replaced or removed'],
  ['appeal_period_expired', 'the appeal period ends'],
  ['permit_expired', 'the permit expires'],
  ['occupancy_certificate_issued', 'the certificate of occupancy is issued'],
  ['final_inspection_passed', 'the final inspection passes'],
  ['case_closed', 'the enforcement case is closed'],
  ['request_completed', 'the records request is closed or withdrawn'],
])

export function retentionText(status: RetentionStatus | null): string {
  if (status === null) return 'No record series assigned'
  if (status.state === 'permanent') return 'Permanent'
  if (status.state === 'eligible_on') return `Eligible ${formatCivilDate(status.date)}`
  const events = status.awaiting.map((e) => EVENT_TEXT.get(e) ?? e.replaceAll('_', ' '))
  return `Starts when ${events.join(' or ')}`
}
