'use server'

import { adjustClock } from '@/features/clocks/adjustClock'
import { createFeeOverride } from '@/features/fees/feeOverrides'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'
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

export async function adjustClockAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const clockId = idOf(formData, 'clockId')
    const kind = text(formData, 'kind')
    if (clockId === null || !['extension', 'waiver', 'statutory_exception'].includes(kind))
      return INVALID
    const days = text(formData, 'days')
    const citation = text(formData, 'citation')
    const result = await adjustClock(
      db,
      actor,
      {
        clockId,
        kind: kind as 'extension',
        ...(days === '' ? {} : { days: Number(days) }),
        reason: text(formData, 'reason'),
        applicantConsent: text(formData, 'applicantConsent') === 'on',
        ...(citation === ''
          ? {}
          : { legalAuthority: { citation, explanation: text(formData, 'explanation') } }),
      },
      signal,
    )
    return done(result, 'Clock adjusted.')
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
