'use server'

import { parseRecheckDays, publishRecheckDays } from '@/features/rosters/recheckInterval'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'

const COPY: Record<string, string> = {
  invalid_days: 'Enter a whole number of days from 1 to 3650.',
  draft_pending:
    'Board settings has an unpublished draft. Publish or discard it in Settings, then change the interval here.',
}

export async function changeRecheckIntervalAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const days = parseRecheckDays(text(formData, 'days'))
    if (days === null) return { ok: false, error: COPY.invalid_days ?? '' }
    const result = await publishRecheckDays(db, actor, days, signal)
    if (result.ok) {
      return {
        ok: true,
        message: `Published as version ${result.value.version}. Contacts are now due every ${days} days.`,
      }
    }
    return { ok: false, error: COPY[result.error] ?? errorCopy(result.error) }
  })
}
