import { text } from '@/server/actionRunner'
import type { CivilDate } from '@/types/civilDate'

const DATE = /^\d{4}-\d{2}-\d{2}$/

function civil(formData: FormData, key: string): CivilDate | null {
  const value = text(formData, key)
  return DATE.test(value) ? (value as CivilDate) : null
}

export function completenessVoteInput(formData: FormData) {
  const votedOn = civil(formData, 'votedOn')
  const outcome = text(formData, 'outcome')
  if (votedOn === null || (outcome !== 'accepted' && outcome !== 'not_accepted')) return null
  const reason = text(formData, 'reason')
  return {
    applicationId: text(formData, 'applicationId'),
    meetingId: text(formData, 'meetingId'),
    votedOn,
    outcome,
    ...(reason === '' ? {} : { reason }),
  } as const
}

export function certificationInput(formData: FormData) {
  const requestedOn = civil(formData, 'requestedOn')
  const outcome = text(formData, 'outcome')
  if (requestedOn === null || !['pending', 'certified', 'refused'].includes(outcome)) return null
  const decidedOn = civil(formData, 'decidedOn')
  return {
    applicationId: text(formData, 'applicationId'),
    requestedOn,
    outcome: outcome as 'pending' | 'certified' | 'refused',
    ...(decidedOn === null ? {} : { decidedOn }),
  } as const
}
