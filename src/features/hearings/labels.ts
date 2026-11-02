import type { HearingKind } from '@/features/hearings/hearings'

export const HEARING_KIND_LABELS: Record<HearingKind, string> = {
  submission_and_hearing: 'Submission and public hearing',
  public_hearing: 'Public hearing',
  rehearing: 'Rehearing',
}

export function formatMinuteOfDay(minute: number): string {
  const hours24 = Math.floor(minute / 60)
  const mins = minute % 60
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`
}
