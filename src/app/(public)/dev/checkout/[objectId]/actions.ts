'use server'

import { redirect } from 'next/navigation'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { loadDevCheckout, resolveDevCheckout } from '@/features/payments/simulatedCheckout'
import { guardAction } from '@/server/actionGuard'
import { type ActionResult, errorCopy, text } from '@/server/actionRunner'
import { portalActorOrNull } from '@/server/requirePortal'

const ACTION_TIMEOUT_MS = 30_000

async function resolve(formData: FormData, decision: 'approve' | 'decline'): Promise<ActionResult> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { ok: false, error: errorCopy(guard.error) }
  const objectId = text(formData, 'objectId')
  const actor = await portalActorOrNull(signal)
  const visible = await loadDevCheckout(
    db,
    objectId,
    { enabled: env.ENABLE_SIMULATED_PAYMENTS, actor },
    signal,
  )
  if (visible === null) return { ok: false, error: errorCopy('not_found') }
  const result = await resolveDevCheckout(db, objectId, decision, signal)
  if (!result.ok) return { ok: false, error: errorCopy('not_found') }
  redirect(`/payments/return/${result.value.attemptId}`)
}

export async function approveCheckoutAction(formData: FormData): Promise<ActionResult> {
  return await resolve(formData, 'approve')
}

export async function declineCheckoutAction(formData: FormData): Promise<ActionResult> {
  return await resolve(formData, 'decline')
}
