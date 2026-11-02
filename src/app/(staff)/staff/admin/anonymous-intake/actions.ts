'use server'

import {
  disableAnonymousIntake,
  enableAnonymousIntake,
} from '@/features/anonymousIntake/staffControl'
import { type ActionResult, runStaffAction } from '@/server/actionRunner'
import { enforcementError } from '../../enforcement/enforcementAction'

export async function enableAnonymousIntakeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const result = await enableAnonymousIntake(db, actor, signal)
    return result.ok
      ? { ok: true, message: 'Anonymous intake is on.' }
      : { ok: false, error: enforcementError(result.error) }
  })
}

export async function disableAnonymousIntakeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const result = await disableAnonymousIntake(db, actor, signal)
    return result.ok
      ? { ok: true, message: 'Anonymous intake is off.' }
      : { ok: false, error: enforcementError(result.error) }
  })
}
