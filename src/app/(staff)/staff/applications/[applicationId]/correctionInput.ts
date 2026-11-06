import type { FieldError } from '@/features/forms/validateSubmission'
import type { CorrectionDraft } from '@/features/permits/correction/checkCorrection'
import type { ContractorChoice } from '@/features/permits/correction/contractor'
import type { CorrectionError } from '@/features/permits/correction/correctPermit'
import { fieldErrorCopy } from '@/features/portal/formData'
import { type ActionResult, errorCopy, text } from '@/server/actionRunner'
import { refuseField } from '@/server/formInput'
import { idOf } from './actionInput'

const NOT_A_CORRECTION = 'so it is not a correction. Start an amended application instead.'

const COPY: Record<Exclude<CorrectionError, object>, string> = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  not_correctable:
    'Only an issued permit, or one that closed when it was issued, can be corrected.',
  reason_required: 'Give the reason for the correction.',
  title_required: 'Enter the project title.',
  fee_change: `This would change the fees, ${NOT_A_CORRECTION}`,
  unknown_party: 'That person is no longer listed on this project. Reload the page.',
  contractor_name_required: "Enter the new contractor's name.",
}

export function feeRefusal(): string {
  return COPY.fee_change
}

export function reviewRefusal(labels: string[]): string {
  return `Changing ${labels.join(', ')} would change the review, ${NOT_A_CORRECTION}`
}

function contractorOf(formData: FormData): ContractorChoice | null {
  const choice = text(formData, 'contractor')
  if (choice === 'keep') return { kind: 'keep' }
  if (choice === 'new') {
    const email = text(formData, 'contractorEmail')
    return {
      kind: 'new',
      name: text(formData, 'contractorName'),
      ...(email === '' ? {} : { email }),
    }
  }
  const partyId = idOf(formData, 'contractor')
  return partyId === null ? null : { kind: 'party', partyId }
}

function valuesOf(formData: FormData): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text(formData, 'values'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function draftOf(formData: FormData): CorrectionDraft | null {
  const applicationId = idOf(formData)
  const values = valuesOf(formData)
  const contractor = contractorOf(formData)
  if (applicationId === null || values === null || contractor === null) return null
  return { applicationId, values, contractor }
}

export function fieldErrorsOf(errors: FieldError[]): Record<string, string> {
  return Object.fromEntries(errors.map((e) => [e.field, fieldErrorCopy(e.code)]))
}

const FIELD_OF_ERROR: Partial<Record<Exclude<CorrectionError, object>, string>> = {
  reason_required: 'reason',
  title_required: 'projectTitle',
  contractor_name_required: 'contractorName',
}

export function correctionFailure(error: CorrectionError): ActionResult {
  if (typeof error === 'string') {
    const field = FIELD_OF_ERROR[error]
    return field === undefined ? { ok: false, error: COPY[error] } : refuseField(field, COPY[error])
  }
  if ('review' in error) return { ok: false, error: reviewRefusal(error.review) }
  return {
    ok: false,
    error: 'Check the highlighted answers.',
    fieldErrors: fieldErrorsOf(error.fieldErrors),
  }
}
