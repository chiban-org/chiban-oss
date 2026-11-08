import { z } from 'zod'
import { REPORT_FREQUENCIES, SCHEDULABLE_REPORTS } from '@/db/schema'
import { choice, recordId } from '@/features/input/schemas'
import { isUuid } from '@/utils/uuid'

const NO_RECIPIENT = 'Choose at least one person to send it to.'

const asList = (value: unknown): unknown[] => {
  if (value === undefined || value === '') return []
  return Array.isArray(value) ? value : [value]
}

const recipientIds = z.preprocess(
  asList,
  z.array(z.string()).superRefine((ids, ctx) => {
    if (ids.length === 0 || ids.some((id) => !isUuid(id))) {
      ctx.addIssue({ code: 'custom', message: NO_RECIPIENT })
    }
  }),
)

export const SCHEDULE_FORM = z.object({
  report: choice('a report', SCHEDULABLE_REPORTS),
  frequency: choice('how often to send it', REPORT_FREQUENCIES),
  recipientIds,
})

export const EDIT_SCHEDULE_FORM = SCHEDULE_FORM.extend({ scheduleId: recordId('a schedule') })

export const SCHEDULE_ID_FORM = z.object({ scheduleId: recordId('a schedule') })
