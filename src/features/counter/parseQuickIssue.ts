import { z } from 'zod'
import { LICENSE_RESULTS, type LicenseResult } from '@/db/schema/licenseChecks'
import type { QuickIssueInput } from '@/features/counter/quickIssue'
import { blankAsNull, inputField } from '@/features/input/field'
import { optionalRecordId } from '@/features/input/optionalRecordId'
import {
  choice,
  emailAddress,
  optionalMoneyCents,
  optionalText,
  recordId,
  requiredText,
} from '@/features/input/schemas'
import { dollarsToCents } from '@/lib/money'
import { type ActionFailure, parseForm } from '@/server/formInput'
import { err, ok, type Result } from '@/types/result'

const VALUE_PREFIX = 'value.'
const LICENSE_FIELDS = ['licenseNumber', 'licenseType', 'licenseResult'] as const

export { dollarsToCents }

function optionalEmail(noun: string) {
  const email = emailAddress(noun)
  return inputField(
    blankAsNull((raw) => {
      const parsed = email.safeParse(raw)
      return parsed.success ? ok(parsed.data) : err(parsed.error.issues[0]?.message ?? '')
    }),
  )
}

const QUICK_ISSUE_FORM = z
  .object({
    parcelId: recordId('a parcel'),
    typeKey: requiredText('a permit type', { max: 100 }),
    contractorName: requiredText('the contractor name', { max: 200 }),
    contractorEmail: optionalEmail('the contractor email'),
    licenseNumber: optionalText('the license number', { max: 100 }),
    licenseType: optionalText('the license type', { max: 100 }),
    licenseResult: optionalText('the result of the state lookup', { max: 50 }),
    licenseNote: optionalText('the license note', { max: 500 }),
    payerName: optionalText('the payer name', { max: 200 }),
    method: choice('a payment method', ['cash', 'check', 'card'] as const),
    checkNumber: optionalText('the check number', { max: 50 }),
    tendered: optionalMoneyCents('the cash tendered'),
    applicationId: optionalRecordId('Start the permit again from the parcel.'),
  })
  .superRefine((value, ctx) => {
    if (value.method === 'check' && value.checkNumber === null) {
      ctx.addIssue({ code: 'custom', path: ['checkNumber'], message: 'Enter the check number.' })
    }
    const result = value.licenseResult
    if (result !== null && !(LICENSE_RESULTS as readonly string[]).includes(result)) {
      ctx.addIssue({ code: 'custom', path: ['licenseResult'], message: 'Choose a result.' })
    }
    const given = LICENSE_FIELDS.filter((f) => value[f] !== null)
    if (given.length === 0 || given.length === LICENSE_FIELDS.length) return
    for (const field of LICENSE_FIELDS) {
      if (value[field] === null) {
        ctx.addIssue({ code: 'custom', path: [field], message: 'Fill in all the license fields.' })
      }
    }
  })

function workValues(data: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const [key, raw] of data.entries()) {
    if (!key.startsWith(VALUE_PREFIX) || typeof raw !== 'string') continue
    const name = key.slice(VALUE_PREFIX.length)
    if (raw === 'on') values[name] = true
    else if (raw.trim() !== '') values[name] = raw.trim()
  }
  return values
}

function paymentOf(form: z.output<typeof QUICK_ISSUE_FORM>): QuickIssueInput['payment'] {
  if (form.method === 'card') return { method: 'card' }
  if (form.method === 'check') return { method: 'check', checkNumber: form.checkNumber ?? '' }
  return form.tendered === null
    ? { method: 'cash' }
    : { method: 'cash', tenderedCents: form.tendered }
}

export function parseQuickIssue(data: FormData): Result<QuickIssueInput, ActionFailure> {
  const parsed = parseForm(QUICK_ISSUE_FORM, data)
  if (!parsed.ok) return parsed
  const form = parsed.value
  const { licenseNumber, licenseType, licenseResult, licenseNote } = form
  return ok({
    parcelId: form.parcelId,
    applicationTypeKey: form.typeKey,
    values: workValues(data),
    contractor: {
      name: form.contractorName,
      ...(form.contractorEmail === null ? {} : { email: form.contractorEmail }),
    },
    ...(licenseNumber === null || licenseType === null || licenseResult === null
      ? {}
      : {
          license: {
            number: licenseNumber,
            type: licenseType,
            result: licenseResult as LicenseResult,
            ...(licenseNote === null ? {} : { note: licenseNote }),
          },
        }),
    payerName: form.payerName ?? form.contractorName,
    payment: paymentOf(form),
    ...(form.applicationId === null ? {} : { applicationId: form.applicationId }),
  })
}
