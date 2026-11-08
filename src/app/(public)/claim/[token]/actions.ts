'use server'

import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { claimProject } from '@/features/contractors/claims'
import { guardAction } from '@/server/actionGuard'
import { type ActionResult, errorCopy, text } from '@/server/actionRunner'

const ACTION_TIMEOUT_MS = 15_000
const LANDING = { contractor: '/portal/contractor', applicant: '/portal' } as const

const CLAIM_COPY = {
  sign_in_required: 'Sign in to claim this project.',
  invalid: 'This link is no longer valid. Ask the person who sent it for a new one.',
  email_mismatch:
    'This link was sent to a different email address than the one you are signed in with. Sign in with the address that received it.',
} as const

export async function claimProjectAction(formData: FormData): Promise<ActionResult> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { ok: false, error: errorCopy(guard.error) }
  const result = await claimProject(db, guard.value, text(formData, 'token'), signal)
  if (!result.ok) return { ok: false, error: CLAIM_COPY[result.error] }
  const { applicationId, role } = result.value
  redirect(applicationId === null ? LANDING[role] : `/portal/applications/${applicationId}`)
}
