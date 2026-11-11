import { z } from 'zod'
import { BACKUP_FREQUENCIES } from '@/db/schema'
import { blankAsNull, inputField } from '@/features/input/field'
import { choice, wholeNumber } from '@/features/input/schemas'
import { err, ok } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export const MAX_KEEP = 365
export const LAST_HOUR = 23

const targetChoice = inputField(
  blankAsNull((raw) => {
    const value = typeof raw === 'string' ? raw.trim() : ''
    return isUuid(value) ? ok(value) : err('Choose where backups go.')
  }),
)

export const BACKUP_SCHEDULE_FORM = z.object({
  targetId: targetChoice,
  frequency: choice('how often to back up', BACKUP_FREQUENCIES),
  startHour: wholeNumber('the start time', { min: 0, max: LAST_HOUR }),
  keepCount: wholeNumber('how many backups to keep', { min: 1, max: MAX_KEEP }),
})

export const BACK_UP_NOW_FORM = z.object({})
