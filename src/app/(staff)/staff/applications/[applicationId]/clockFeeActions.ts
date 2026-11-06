'use server'

import { z } from 'zod'
import { type AdjustError, adjustClock } from '@/features/clocks/adjustClock'
import { MAX_ADJUSTMENT_DAYS } from '@/features/clocks/adjustmentKinds'
import { createFeeOverride } from '@/features/fees/feeOverrides'
import {
  checkbox,
  choice,
  optionalText,
  optionalWholeNumber,
  recordId,
  requiredText,
} from '@/features/input/schemas'
import { formatCivilDate } from '@/lib/formatDate'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import type { CivilDate } from '@/types/civilDate'
import type { Result } from '@/types/result'
import { done, INVALID, idOf } from './actionInput'

const MAX_CENT_DIGITS = 2

function cents(value: string): number | null {
  const [dollars = '', fraction = '', ...rest] = value.split('.')
  const wholeOk = rest.length === 0 && /^\d+$/.test(dollars)
  const fractionOk =
    !value.includes('.') ||
    (fraction.length > 0 && fraction.length <= MAX_CENT_DIGITS && /^\d+$/.test(fraction))
  return wholeOk && fractionOk ? Math.round(Number(value) * 100) : null
}

const ADJUSTMENT_FORM = z.object({
  clockId: recordId('a clock'),
  kind: choice('a kind of adjustment', ['extension', 'waiver', 'statutory_exception'] as const),
  days: optionalWholeNumber('the number of days', { min: 1, max: MAX_ADJUSTMENT_DAYS }),
  reason: requiredText('a reason', { max: 2000 }),
  applicantConsent: checkbox(),
  citation: optionalText('the legal citation', { max: 500 }),
  explanation: optionalText('the legal explanation', { max: 2000 }),
})

const ADJUSTMENT_FIELD: Partial<Record<AdjustError, string>> = {
  consent_required: 'applicantConsent',
  due_required: 'days',
  days_out_of_range: 'days',
  reason_required: 'reason',
  authority_required: 'citation',
}

function adjusted(result: Result<{ newDue: CivilDate | null }, AdjustError>): ActionResult {
  if (result.ok) {
    const { newDue } = result.value
    return {
      ok: true,
      message:
        newDue === null
          ? 'Clock adjusted.'
          : `Clock adjusted. It is now due ${formatCivilDate(newDue)}.`,
    }
  }
  const field = ADJUSTMENT_FIELD[result.error]
  const message = errorCopy(result.error)
  return field === undefined ? { ok: false, error: message } : refuseField(field, message)
}

export async function adjustClockAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ADJUSTMENT_FORM, async ({ db, actor, signal }, input) => {
    const result = await adjustClock(
      db,
      actor,
      {
        clockId: input.clockId,
        kind: input.kind,
        ...(input.days === null ? {} : { days: input.days }),
        reason: input.reason,
        applicantConsent: input.applicantConsent,
        ...(input.citation === null
          ? {}
          : {
              legalAuthority: { citation: input.citation, explanation: input.explanation ?? '' },
            }),
      },
      signal,
    )
    return adjusted(result)
  })
}

export async function feeOverrideAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    const kind = text(formData, 'kind')
    if (applicationId === null || (kind !== 'waive' && kind !== 'set_amount')) return INVALID
    const amount = text(formData, 'amount')
    const amountCents = amount === '' ? null : cents(amount)
    if (amount !== '' && amountCents === null) return INVALID
    const result = await createFeeOverride(
      db,
      actor,
      {
        applicationId,
        feeCode: text(formData, 'feeCode'),
        kind,
        ...(amountCents === null ? {} : { amountCents }),
        reason: text(formData, 'reason'),
      },
      signal,
    )
    return done(result, 'Fee override saved. It applies at the next assessment.')
  })
}
