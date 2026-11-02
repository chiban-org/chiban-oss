import { revalidatePath } from 'next/cache'
import { type Db, db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { guardAction } from '@/server/actionGuard'

export type ActionResult = { ok: true; message: string } | { ok: false; error: string }

export interface ActionContext {
  db: Db
  actor: Actor
  signal: AbortSignal
}

const ACTION_TIMEOUT_MS = 30_000

export const ERROR_COPY: Record<string, string> = {
  csrf: 'Your session expired. Reload the page and try again.',
  signed_out: 'Sign in to continue.',
  forbidden: 'You do not have permission to do this.',
  invalid_input: 'Check the form fields and try again.',
  invalid_shape: 'The parents and children do not fit this kind of event.',
  future_date: 'The effective date cannot be in the future.',
  cycle: 'This event would make a parcel its own ancestor.',
  unknown_parcel: 'One of the parcels was not found.',
  alias_taken: 'That ID already belongs to another active parcel.',
  reason_required: 'A reason is required.',
  not_a_descendant: 'That parcel is not a descendant of the record parcel.',
  not_unresolved: 'That record is already linked.',
  not_open: 'That exception is no longer open.',
  no_longer_valid: 'The parcel changed since this row was held. Run the import again.',
  id_format_mismatch: 'The ID does not match the selected format.',
  invalid_parcel_id: 'Choose a parcel from the list.',
  invalid_date: 'Enter a valid date.',
  unknown_format: 'Unknown ID format.',
}

export function errorCopy(code: string): string {
  return ERROR_COPY[code] ?? 'Something went wrong. Try again.'
}

export async function runStaffAction(
  formData: FormData,
  fn: (ctx: ActionContext) => Promise<ActionResult>,
): Promise<ActionResult> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { ok: false, error: errorCopy('csrf') }
  const actor = guard.value
  if (actor?.kind !== 'staff') return { ok: false, error: errorCopy('signed_out') }
  const result = await fn({ db, actor, signal })
  if (result.ok) revalidatePath('/staff', 'layout')
  return result
}

export function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}
