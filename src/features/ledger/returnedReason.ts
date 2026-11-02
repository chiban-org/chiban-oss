import { formatCivilDate } from '@/lib/formatDate'

export function returnedCheckReason(returnedOn: string, reason: string): string {
  return `Returned ${formatCivilDate(returnedOn)}: ${reason}`
}
