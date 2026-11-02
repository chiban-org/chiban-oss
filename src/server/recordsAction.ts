import { civilDateSchema } from '@packs/nh/schema'
import { z } from 'zod'
import {
  type ActionContext,
  type ActionResult,
  errorCopy,
  runStaffAction,
} from '@/server/actionRunner'
import { type FieldCopy, invalidFieldCopy } from '@/server/fieldCopy'
import type { Result } from '@/types/result'

export const uuidField = z.string().uuid()
export const dateField = civilDateSchema
export const optionalField = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional())

export const RECORDS_COPY: Record<string, string> = {
  forbidden: errorCopy('forbidden'),
  invalid: errorCopy('invalid_input'),
  not_found: errorCopy('not_found'),
  future_date: 'The date cannot be in the future.',
  before_received: 'The response date cannot be before the request was received.',
  already_responded: 'This request already has a first response.',
  withholding_required:
    'Record at least one withheld record with its exemption before denying a request.',
  stated_date_required: 'Enter a date on or after the response date for the time the town needs.',
  website_url_required: 'Enter the web address where the records are posted.',
  release_required:
    'Nothing has been released yet. Approve and release the records under Releases; the first release records the response.',
  unknown_exemption: 'Choose an exemption from the list for every withheld or redacted record.',
  citation_required: 'Enter the law that makes the record confidential.',
  explanation_required:
    'Explain in a sentence or two how the exemption applies (at least 20 characters).',
  not_open: 'This request is closed.',
  approval_missing: 'Choose approved versions that belong to the documents you are releasing.',
  approval_revoked:
    'One of the approvals was revoked. Approve the version again before releasing it.',
  redaction_not_cited:
    'A redacted copy needs the exemptions drawn in Chiban before it can be released.',
  recipient_required: 'Enter the email address for the link.',
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
  not_cancellable: 'That batch can no longer be cancelled.',
  not_approved: 'That batch is not approved.',
  stale_version: 'This record changed since you opened it. Reload the page and try again.',
  already_closed: 'This request is already closed.',
  units_do_not_fit_category: 'The building and unit counts do not fit that kind of structure.',
  phase_counts_must_be_zero:
    'A foundation or finish-only permit reports no buildings or units, only a valuation above zero.',
  not_a_building_permit: 'Only building permits are reported to the Census Bureau.',
}

export function recordsError(error: unknown): string {
  if (typeof error === 'string') return RECORDS_COPY[error] ?? errorCopy(error)
  return errorCopy('unknown')
}

export function formStrings(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string' || key === 'csrf_token') continue
    const held = out[key]
    out[key] = held === undefined ? value.trim() : `${held},${value.trim()}`
  }
  return out
}

export async function runRecords<S extends z.ZodType>(
  formData: FormData,
  schema: S,
  call: (ctx: ActionContext, input: z.output<S>) => Promise<Result<unknown, unknown>>,
  message: string,
  fieldCopy: FieldCopy = {},
): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) => {
    const parsed = schema.safeParse(formStrings(formData))
    if (!parsed.success) {
      return {
        ok: false,
        error: invalidFieldCopy(parsed.error, fieldCopy) ?? recordsError('invalid'),
      }
    }
    const result = await call(ctx, parsed.data)
    return result.ok ? { ok: true, message } : { ok: false, error: recordsError(result.error) }
  })
}
