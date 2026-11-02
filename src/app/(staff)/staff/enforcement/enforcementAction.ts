import type { z } from 'zod'
import { ORDER_CONTENT_LABELS } from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import {
  type ActionContext,
  type ActionResult,
  errorCopy,
  runStaffAction,
} from '@/server/actionRunner'
import type { CivilDate } from '@/types/civilDate'
import type { Result } from '@/types/result'

const COPY: Record<string, string> = {
  forbidden: errorCopy('forbidden'),
  invalid: errorCopy('invalid_input'),
  not_found: errorCopy('not_found'),
  empty: 'Enter some text.',
  invalid_transition: 'That step is not available from the current status.',
  stale_version: 'This record changed since you opened it. Reload the page and try again.',
  case_not_investigating: 'The case has to be under investigation before findings can be recorded.',
  findings_invalid: 'Choose open findings that belong to this case.',
  split_required:
    'These findings mix building code and other violations. Issue a separate order for each kind.',
  not_a_draft: 'That order has already been issued.',
  case_not_ready: 'The case needs a violation finding before an order can be issued.',
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
  filing_needs_complete_service:
    'Every required recipient must be served, with proof, before the order is filed with the clerk.',
  motion_required: 'Record the motion to enforce before the judgment.',
  service_incomplete: 'Service is not complete.',
  answer_period_running: 'The answer period is still running.',
  answered: 'An answer was received, so the motion cannot be filed.',
  not_filed_with_clerk: 'File the order with the court clerk first.',
  document_invalid: 'Choose a document that belongs to this case.',
  target_not_found: 'That order or notice does not belong to this case.',
  not_issuing_officer:
    'Only the officer who issued the order or sent the notice can certify imminent peril.',
  appeal_resolved: 'That appeal is already resolved.',
  already_resolved: 'That appeal is already resolved.',
  already_certified: 'Imminent peril is already certified for this appeal.',
  judgment_required: 'A fine needs a recorded court judgment for this case.',
  complaint_text_unreviewed:
    'Write the public text for every complaint before publishing the case.',
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

export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string' || key === 'csrf_token') continue
    const held = out[key]
    out[key] = held === undefined ? value.trim() : `${held},${value.trim()}`
  }
  return out
}

export async function runEnforcement<S extends z.ZodType>(
  formData: FormData,
  schema: S,
  call: (ctx: ActionContext, input: z.output<S>) => Promise<Result<unknown, Failure>>,
  message: string,
): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) => {
    const parsed = schema.safeParse(formValues(formData))
    if (!parsed.success) return { ok: false, error: enforcementError('invalid') }
    const result = await call(ctx, parsed.data)
    return result.ok ? { ok: true, message } : { ok: false, error: enforcementError(result.error) }
  })
}
