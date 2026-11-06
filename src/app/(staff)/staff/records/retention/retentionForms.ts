import { z } from 'zod'
import { choice, civilDate, optionalText, recordId } from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'

const MAX_NOTE = 1000

export const recordEventForm = (today: CivilDate) =>
  z.object({
    targetKind: choice('what the event is about', ['project', 'case'] as const),
    targetId: recordId('a record'),
    kind: choice('what happened', [
      'building_removed',
      'septic_replaced_or_removed',
      'appeal_period_expired',
    ] as const),
    occurredOn: civilDate('the date it happened', { latest: today }),
    note: optionalText('a note', { max: MAX_NOTE }),
  })

export const proposeForm = (today: CivilDate) =>
  z.object({ asOf: civilDate('the date', { latest: today }) })

export const batchForm = z.object({ batchId: recordId('a batch') })
