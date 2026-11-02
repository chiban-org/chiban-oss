'use server'

import { db } from '@/db/client'
import { acknowledgeAlert } from '@/features/health/syntheticAlert'
import { guardAction } from '@/server/actionGuard'
import { type ActionResult, errorCopy, text } from '@/server/actionRunner'

const ACTION_TIMEOUT_MS = 15_000

export async function acknowledgeAlertAction(formData: FormData): Promise<ActionResult> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { ok: false, error: errorCopy(guard.error) }
  const result = await acknowledgeAlert(db, text(formData, 'token'), new Date(), signal)
  if (!result.ok) return { ok: false, error: 'This link is no longer valid.' }
  return { ok: true, message: 'Thank you. Your confirmation has been recorded.' }
}
