import { ORDER_CONTENT_LABELS } from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import { errorCopy } from '@/server/actionRunner'
import type { CivilDate } from '@/types/civilDate'

const COPY: Record<string, string> = {
  forbidden: errorCopy('forbidden'),
  invalid: errorCopy('invalid_input'),
  not_found: errorCopy('not_found'),
  empty: 'Enter some text.',
  invalid_transition: 'That step is not available from the current status.',
  reason_required: 'Enter the reason the case is being closed.',
  finding_required:
    'Record a violation finding first. Recording it moves the case to Violation found.',
  stale_version: 'This record changed since you opened it. Reload the page and try again.',
  case_not_investigating: 'The case has to be under investigation before findings can be recorded.',
  findings_invalid: 'Choose open findings that belong to this case.',
  split_required:
    'These findings mix building code and other violations. Issue a separate order for each kind.',
  not_a_draft: 'That order has already been issued.',
  case_not_ready: 'The case needs a violation finding before an order can be issued.',
  case_past_orders: 'Orders cannot be issued once the case is in court, resolved, or closed.',
  not_designated:
    'You are not on record as a designated enforcement officer on the issue date. An administrator can add it under Admin, Enforcement officers.',
  deadline_before_issue: 'The corrective action deadline is before the issue date.',
  stayed:
    'Enforcement is stayed by an appeal. Notes, photos, service, and answers can still be recorded.',
  order_not_active:
    'That order was annulled, withdrawn, or complied with, so no more court steps can be recorded.',
  date_before_motion: 'The judgment cannot be dated before the motion to enforce.',
  order_not_issued: 'The order has not been issued yet.',
  recipient_not_found: 'That recipient is not on this order.',
  proof_required:
    'Upload the proof first, then choose it here. Proof of service is a return of service, an affidavit of posting, or a newspaper tear sheet.',
  fallback_needs_owner_not_found:
    'Posting and publication are allowed only after the owner of record is marked as not found.',
  server_role_required:
    'Hand delivery needs a server who is a sheriff, deputy sheriff, local police officer, or constable.',
  invalid_outcome: 'That result is not allowed for this role.',
  date_in_future: 'The date cannot be in the future.',
  parcel_not_found: 'No parcel has that number or site address. Check it on the parcel page.',
  parcel_ambiguous: 'More than one parcel matches. Enter the parcel number instead.',
  filing_needs_complete_service:
    'Every required recipient must be served, with proof, before the order is filed with the clerk.',
  motion_required: 'Record the motion to enforce before the judgment.',
  service_incomplete: 'Service is not complete.',
  answer_period_running: 'The answer period is still running.',
  recipient_method_mismatch:
    'Choose who was served. Posting and newspaper publication are the only methods recorded without a recipient.',
  answered: 'An answer was received, so the motion cannot be filed.',
  not_filed_with_clerk: 'File the order with the court clerk first.',
  document_invalid: 'Choose a document that belongs to this case.',
  target_not_found: 'That order or notice does not belong to this case.',
  not_issuing_officer:
    'Only the officer who issued the order or sent the notice can certify imminent peril.',
  appeal_resolved: 'That appeal is already resolved.',
  already_resolved: 'That appeal is already resolved.',
  already_ended: 'That designation has already ended.',
  already_certified: 'Imminent peril is already certified for this appeal.',
  judgment_required: 'A fine needs a recorded court judgment for this case.',
  complaint_text_unreviewed:
    'Write the public text for every complaint before showing the case on the public site.',
  verification_required:
    'Anonymous intake needs a passing retention check for the version that is running.',
}

type Failure = string | { missingContent: string[] } | { filingLeadUntil: CivilDate } | object

function contentLabel(key: string): string {
  return Object.entries(ORDER_CONTENT_LABELS).find(([k]) => k === key)?.[1] ?? key
}

export function enforcementError(error: Failure): string {
  if (typeof error === 'string') return COPY[error] ?? errorCopy(error)
  if ('missingContent' in error) {
    const names = error.missingContent.map(contentLabel)
    return `The order is missing: ${names.join(', ')}.`
  }
  if ('filingLeadUntil' in error) {
    return `The motion cannot be filed until ${formatCivilDate(error.filingLeadUntil)}, five days after the order was filed with the clerk.`
  }
  return errorCopy('unknown')
}
