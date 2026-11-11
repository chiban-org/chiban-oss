'use server'

import { requestBackupNow, saveBackupSchedule } from '@/features/backup/schedule/scheduleStore'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { BACK_UP_NOW_FORM, BACKUP_SCHEDULE_FORM } from './backupForm'

const BACKUP = { exempt: 'export', lockedInDemo: true } as const

const NOT_SCHEDULED = 'Choose where backups go and save the schedule first.'
const TARGET_MISSING = 'That storage no longer exists. Choose another one.'

export async function saveBackupScheduleAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    BACKUP_SCHEDULE_FORM,
    async ({ db, actor, signal }, input) => {
      const saved = await saveBackupSchedule(db, actor, { ...input, at: new Date() }, signal)
      if (saved.ok) {
        return {
          ok: true,
          message: input.targetId === null ? 'Saved. Scheduled backups are off.' : 'Saved.',
        }
      }
      if (saved.error === 'not_found') return refuseField('targetId', TARGET_MISSING)
      return { ok: false, error: errorCopy(saved.error) }
    },
    BACKUP,
  )
}

export async function backUpNowAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    BACK_UP_NOW_FORM,
    async ({ db, actor, signal }) => {
      const asked = await requestBackupNow(db, actor, new Date(), signal)
      if (asked.ok) {
        return { ok: true, message: 'Requested. The backup starts within a minute or two.' }
      }
      return {
        ok: false,
        error: asked.error === 'not_scheduled' ? NOT_SCHEDULED : errorCopy(asked.error),
      }
    },
    BACKUP,
  )
}
