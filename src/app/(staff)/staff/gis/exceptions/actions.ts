'use server'

import {
  acceptAllOwnerChanges,
  acceptHeldRow,
  dismissException,
} from '@/features/gis/import/exceptions'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'

export async function acceptHeldRowAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const result = await acceptHeldRow(db, actor, text(formData, 'exceptionId'), signal)
    return result.ok
      ? { ok: true, message: 'Held row applied.' }
      : { ok: false, error: errorCopy(result.error) }
  })
}

export async function acceptAllOwnerChangesAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const result = await acceptAllOwnerChanges(db, actor, text(formData, 'runId'), signal)
    return result.ok
      ? { ok: true, message: `Accepted ${result.value.accepted} owner changes.` }
      : { ok: false, error: errorCopy(result.error) }
  })
}

export async function dismissExceptionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const result = await dismissException(
      db,
      actor,
      text(formData, 'exceptionId'),
      text(formData, 'reason'),
      signal,
    )
    return result.ok
      ? { ok: true, message: 'Exception dismissed.' }
      : { ok: false, error: errorCopy(result.error) }
  })
}
