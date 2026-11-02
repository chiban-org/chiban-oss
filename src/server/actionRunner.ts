import { revalidatePath } from 'next/cache'
import { type Db, db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { guardAction } from '@/server/actionGuard'

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

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
  already_adopted: 'This starter has already been adopted.',
  unknown_starter: 'Unknown starter.',
  no_such_version: 'That version does not exist.',
  not_found: 'That record was not found.',
  fees_incomplete: 'The fees cannot be worked out yet because a count they depend on is not known.',
  stale_version: 'This application changed since you opened it. Reload the page and try again.',
  invalid_transition: 'That step is not available from the current state.',
  not_submitted: 'The application has not been submitted yet.',
  already_complete: 'The application is already marked complete.',
  before_receipt: 'The completeness date cannot be before the application was received.',
  statutory_requires_authority:
    'This gate comes from state law. Only a statutory exception with legal authority can clear it.',
  authority_required: 'Enter the legal authority: a citation and an explanation.',
  unknown_gate: 'That gate does not exist.',
  unknown_condition: "That condition is not in the application's condition library.",
  not_extendable: 'This clock cannot be extended.',
  not_waivable: 'This clock cannot be waived.',
  consent_required: "This extension needs the applicant's consent.",
  due_required: 'Enter the number of days or a new due date.',
  amount_required: 'Enter the amount.',
  board_ref_required: 'Enter the board reference for the earlier determination.',
  certified_mail_required:
    'The regional planning commission and affected municipalities must be notified by certified mail.',
  no_yes_determination: 'Record a determination of regional impact first.',
  not_issued: 'The permit is not issued.',
  no_open_appeal: 'There is no open appeal on this application.',
  before_filing: 'The resolution date cannot be before the appeal was filed.',
  not_suspended: 'The permit is not suspended.',
  already_lapsed: 'The permit has already lapsed and cannot be renewed.',
  election_not_allowed: 'The applicant cannot elect that edition on this receipt date.',
  no_edition_for_date: 'No code edition is on record for the receipt date.',
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
