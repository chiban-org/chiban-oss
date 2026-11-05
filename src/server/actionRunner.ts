import { revalidatePath } from 'next/cache'
import { type Db, db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { type GuardOptions, guardAction } from '@/server/actionGuard'

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
  service_inactive:
    'This service is no longer active. Records can be exported from the admin page until the export window ends.',
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
  not_adopted: 'That starter has not been adopted.',
  unknown_path:
    'One of the selected changes is no longer in the upstream difference. Reload the page.',
  no_such_version: 'That version does not exist.',
  not_found: 'That record was not found.',
  config_inconsistent:
    'The published forms and fees do not agree with each other. Ask an administrator to republish them.',
  fees_incomplete: 'The fees cannot be worked out yet because a count they depend on is not known.',
  stale_version: 'This application changed since you opened it. Reload the page and try again.',
  invalid_transition: 'That step is not available from the current state.',
  not_submitted: 'The application has not been submitted yet.',
  already_complete: 'The application is already marked complete.',
  already_signed_off: 'You have already signed off on this review.',
  before_receipt: 'The completeness date cannot be before the application was received.',
  statutory_requires_authority:
    'This gate comes from state law. Only a statutory exception with legal authority can clear it.',
  authority_required: 'Enter the legal authority: a citation and an explanation.',
  unknown_gate: 'That gate does not exist.',
  unknown_condition: "That condition is not in the application's condition library.",
  application_closed: 'This application is closed, so its conditions can no longer change.',
  not_extendable: 'This clock cannot be extended.',
  not_waivable: 'This clock cannot be waived.',
  consent_required: "This extension needs the applicant's consent.",
  due_required: 'Enter the number of days or a new due date.',
  amount_required: 'Enter the amount.',
  board_ref_required: 'Enter the board reference for the earlier determination.',
  certified_mail_required:
    'The regional planning commission and affected municipalities must be notified by certified mail.',
  no_yes_determination: 'Record a determination of regional impact first.',
  after_issuance:
    'The regional impact record is fixed once the permit is issued or the application is closed.',
  not_issued: 'The permit is not issued.',
  no_open_appeal: 'There is no open appeal on this application.',
  before_filing: 'The resolution date cannot be before the appeal was filed.',
  not_suspended: 'The permit is not suspended.',
  already_lapsed: 'The permit has already lapsed and cannot be renewed.',
  renewal_fee_due:
    'The fee for the last renewal has not been paid. Record that payment before renewing again.',
  election_not_allowed: 'The applicant cannot elect that edition on this receipt date.',
  license_not_active:
    'The license is not active. Do not issue at the counter. Take the application through the normal path.',
  license_required:
    'This permit type needs the contractor license checked. Fill in the license fields.',
  not_direct_issue_type: 'This permit type cannot be issued at the counter.',
  tendered_short: 'The cash tendered is less than the amount due.',
  check_number_required: 'Enter the check number.',
  not_configured: 'Card payments are not configured.',
  nothing_due: 'Nothing is due on this application.',
  over_allocated: 'That payment is more than what is due.',
  amount_mismatch: 'The amounts do not add up.',
  not_published: 'That permit type is not published.',
  attestation_mismatch: 'The attestation text changed. Reload the page and try again.',
  over_reversed: 'That is more than was paid.',
  not_a_payment: 'Only a payment can be refunded.',
  not_a_check: 'That payment was not made by check.',
  not_a_card_payment: 'That payment was not made by card.',
  simulated_disabled: 'The simulated processor is turned off in this environment.',
  outcome_unknown: 'The outcome is still unknown. Check with the processor first.',
  not_voidable: 'Only an attempt that has not been paid can be voided.',
  note_required: 'Add a note: the processor reference or who confirmed the outcome.',
  not_pending: 'This attempt is no longer waiting for the processor. Reload the page.',
  too_soon:
    'The outcome can be recorded by hand only after the attempt has waited a day for the processor.',
  reference_required: "Enter the processor's reference for this payment.",
  reference_in_use: 'That processor reference is already on another payment.',
  processor_reports_payment:
    'The processor reports this payment was captured. It has been recorded.',
  foreign_object: 'The processor reports a payment from a different account. Nothing was recorded.',
  no_fee_line: 'No fee line on that application can take this amount.',
  no_edition_for_date: 'No code edition is on record for the receipt date.',
}

export function errorCopy(code: string): string {
  return ERROR_COPY[code] ?? 'Something went wrong. Try again.'
}

export async function runStaffAction(
  formData: FormData,
  fn: (ctx: ActionContext) => Promise<ActionResult>,
  options: GuardOptions = {},
): Promise<ActionResult> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal, options)
  if (!guard.ok) return { ok: false, error: errorCopy(guard.error) }
  const actor = guard.value
  if (actor?.kind !== 'staff') return { ok: false, error: errorCopy('signed_out') }
  const result = await fn({ db, actor, signal })
  if (result.ok) revalidatePath('/staff', 'layout')
  return result
}

export async function runStaffValue<T extends { ok: boolean }>(
  formData: FormData,
  fail: (error: string) => T,
  fn: (ctx: ActionContext) => Promise<T>,
): Promise<T> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return fail(errorCopy(guard.error))
  if (guard.value?.kind !== 'staff') return fail(errorCopy('signed_out'))
  return await fn({ db, actor: guard.value, signal })
}

export function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}
