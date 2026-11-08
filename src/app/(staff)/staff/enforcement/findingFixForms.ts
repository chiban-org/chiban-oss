import { z } from 'zod'
import { PROVISION_KINDS } from '@/db/schema'
import { choice, civilDate, optionalText, recordId, requiredText } from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'

export const editFindingForm = (today: CivilDate) =>
  z.object({
    findingId: recordId('a finding'),
    provisionKind: choice('what was violated', PROVISION_KINDS),
    provisionRef: requiredText('the section or condition', { max: 300 }),
    facts: requiredText('the facts', { max: 5000 }),
    inspectionDate: civilDate('the inspection date', { latest: today }),
  })

export const withdrawFindingForm = () =>
  z.object({
    findingId: recordId('a finding'),
    reason: requiredText('the reason for withdrawing it', { max: 1000 }),
  })

export const correctedFindingForm = (today: CivilDate) =>
  z.object({
    findingId: recordId('a finding'),
    correctedOn: civilDate('the date corrected', { latest: today }),
    note: optionalText('a note', { max: 1000 }),
  })
