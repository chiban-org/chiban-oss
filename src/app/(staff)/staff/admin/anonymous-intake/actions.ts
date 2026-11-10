'use server'

import { z } from 'zod'
import {
  disableAnonymousIntake,
  enableAnonymousIntake,
} from '@/features/anonymousIntake/staffControl'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { enforcementError } from '../../enforcement/enforcementAction'

const NO_FIELDS = z.object({})
const LOCKED = { lockedInDemo: true }

export async function enableAnonymousIntakeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    NO_FIELDS,
    async ({ db, actor, signal }) => {
      const result = await enableAnonymousIntake(db, actor, signal)
      return result.ok
        ? { ok: true, message: 'Anonymous intake is on.' }
        : { ok: false, error: enforcementError(result.error) }
    },
    LOCKED,
  )
}

export async function disableAnonymousIntakeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    NO_FIELDS,
    async ({ db, actor, signal }) => {
      const result = await disableAnonymousIntake(db, actor, signal)
      return result.ok
        ? { ok: true, message: 'Anonymous intake is off.' }
        : { ok: false, error: enforcementError(result.error) }
    },
    LOCKED,
  )
}
