'use server'

import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { resolveDevCheckout } from '@/features/payments/simulatedCheckout'
import { guardAction } from '@/server/actionGuard'
import { type ActionResult, errorCopy, text } from '@/server/actionRunner'

const ACTION_TIMEOUT_MS = 30_000

async function resolve(formData: FormData, decision: 'approve' | 'decline'): Promise<ActionResult> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { ok: false, error: errorCopy('csrf') }
  const result = await resolveDevCheckout(db, text(formData, 'objectId'), decision, signal)
  if (!result.ok) return { ok: false, error: errorCopy('not_found') }
  redirect(`/payments/return/${result.value.attemptId}`)
}

export async function approveCheckoutAction(formData: FormData): Promise<ActionResult> {
  return await resolve(formData, 'approve')
}

export async function declineCheckoutAction(formData: FormData): Promise<ActionResult> {
  return await resolve(formData, 'decline')
}
