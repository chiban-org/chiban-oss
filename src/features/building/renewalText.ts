import { formatCivilDate } from '@/lib/formatDate'

export function renewedMessage(newDue: string): string {
  return `Renewed. The permit now runs to ${formatCivilDate(newDue)}.`
}
