import { type CivilDate, daysBetween } from '@/types/civilDate'

export type RtkTimeliness =
  | { kind: 'running'; dueOn: CivilDate; daysRemaining: number }
  | { kind: 'due_today'; dueOn: CivilDate }
  | { kind: 'overdue'; dueOn: CivilDate; daysOverdue: number }
  | { kind: 'responded_on_time'; dueOn: CivilDate; respondedOn: CivilDate }
  | { kind: 'responded_late'; dueOn: CivilDate; respondedOn: CivilDate }

export function firstResponseTimeliness(
  dueOn: CivilDate,
  respondedOn: CivilDate | null,
  today: CivilDate,
): RtkTimeliness {
  if (respondedOn !== null) {
    const late = daysBetween(dueOn, respondedOn) > 0
    return { kind: late ? 'responded_late' : 'responded_on_time', dueOn, respondedOn }
  }
  const remaining = daysBetween(today, dueOn)
  if (remaining > 0) return { kind: 'running', dueOn, daysRemaining: remaining }
  if (remaining === 0) return { kind: 'due_today', dueOn }
  return { kind: 'overdue', dueOn, daysOverdue: -remaining }
}
