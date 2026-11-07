'use server'

import { publishRecheckDays } from '@/features/rosters/recheckInterval'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { RECHECK_INTERVAL_FORM } from './noticeForms'

const COPY: Record<string, string> = {
  invalid_days: 'Enter a whole number of days from 1 to 3650.',
  draft_pending:
    'Board settings has a draft that is not in use yet. Put it into use or discard it in Settings, then change the interval here.',
}

export async function changeRecheckIntervalAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    RECHECK_INTERVAL_FORM,
    async ({ db, actor, signal }, { days }) => {
      const result = await publishRecheckDays(db, actor, days, signal)
      if (result.ok) {
        return {
          ok: true,
          message: `Put version ${result.value.version} into use. Contacts are now due every ${days} days.`,
        }
      }
      return { ok: false, error: COPY[result.error] ?? errorCopy(result.error) }
    },
  )
}
