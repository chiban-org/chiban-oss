import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField } from '@/server/formInput'
import type { Result } from '@/types/result'

export const RECORDS_COPY: Record<string, string> = {
  forbidden: errorCopy('forbidden'),
  invalid: errorCopy('invalid_input'),
  not_found: errorCopy('not_found'),
  future_date: 'The date cannot be in the future.',
  before_received: 'The response date cannot be before the request was received.',
  already_responded: 'This request already has a first response.',
  withholding_required:
    'Record at least one withheld record with its exemption before denying a request.',
  not_awaiting_decision: 'This request is not waiting on a decision after a time statement.',
  before_statement: 'The denial date cannot be before the time statement.',
  stated_date_required: 'Enter a date on or after the response date for the time the town needs.',
  website_url_required: 'Enter the web address where the records are posted.',
  release_required:
    'Nothing has been released yet. Choose Release the records now to approve and release them; the first release records the response.',
  unknown_exemption: 'Choose an exemption from the list for every withheld or redacted record.',
  citation_required: 'Enter the law that makes the record confidential.',
  explanation_required:
    'Explain in a sentence or two how the exemption applies (at least 20 characters).',
  not_open: 'This request is closed.',
  approval_missing: 'Choose approved versions that belong to the documents you are releasing.',
  duplicate_document: 'Choose one version of each document for a release.',
  approval_revoked:
    'One of the approvals was revoked. Approve the version again before releasing it.',
  redaction_not_cited:
    'A redacted copy needs the exemptions drawn in Chiban before it can be released.',
  recipient_required: 'Enter the email address to send the records to.',
  send_failed: 'The email could not be sent. Nothing was released.',
  redaction_failed:
    'The redaction could not be completed. Check that every box is on the page and try again.',
  no_boxes: 'Draw at least one box.',
  unsupported_type: 'Only PDF, JPEG, and PNG files can be redacted.',
  wrong_role: 'That version cannot be approved for this use.',
  not_ready: 'The archival copy is still being made. Try again in a minute.',
  reason_required: 'Enter a reason of at least 10 characters.',
  already_revoked: 'That approval was already revoked.',
  kind_not_for_target: 'That event does not apply to this kind of record.',
  nothing_eligible: 'No records are eligible on that date.',
  not_proposed: 'That batch is no longer waiting for approval.',
  own_proposal: 'You proposed this batch, so another records custodian has to approve it.',
  not_cancellable: 'That batch can no longer be cancelled.',
  not_approved: 'That batch is not approved.',
  stale_version: 'This record changed since you opened it. Reload the page and try again.',
  already_closed: 'This request is already closed.',
  units_do_not_fit_category:
    'The housing units do not fit that kind of structure: one per building for a single-family house, two per building for a two-unit building, three or four per building, or five or more per building.',
  excluded_reason_required: 'Choose why the permit is left out of the count.',
  excluded_carries_counts:
    'A permit left out of the count reports 0 buildings, 0 housing units and a valuation of 0.',
  reason_without_exclusion:
    'A reason to leave the permit out goes with the kind "Left out of the count". Choose that kind, or set the reason to "Not left out".',
  phase_counts_must_be_zero:
    'A foundation or finish-only permit reports no buildings or units, only a valuation above zero.',
  not_a_building_permit: 'Only building permits are reported to the Census Bureau.',
}

export function recordsError(error: unknown): string {
  if (typeof error === 'string') return RECORDS_COPY[error] ?? errorCopy(error)
  return errorCopy('unknown')
}

export type FieldOf = Readonly<Record<string, string>>

export function recordsOutcome(
  result: Result<unknown, unknown>,
  message: string,
  fieldOf: FieldOf = {},
): ActionResult {
  if (result.ok) return { ok: true, message }
  const copy = recordsError(result.error)
  const field = typeof result.error === 'string' ? fieldOf[result.error] : undefined
  return field === undefined ? { ok: false, error: copy } : refuseField(field, copy)
}
