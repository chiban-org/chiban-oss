'use server'

import { recordApplicationPayment } from '@/features/counter/applicationPayment'
import { moveFunds } from '@/features/ledger/moveFunds'
import { recordChargeback, recordReturnedCheck, refundEntry } from '@/features/ledger/reversals'
import { checkWithProcessor, voidAttempt } from '@/features/payments/startPayment'
import { dollarsToCents, formatCents } from '@/lib/money'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { parseCivilDate } from '@/types/civilDate'
import { isUuid } from '@/utils/uuid'

type Failure = string | { kind: string; detail: string }

const INVALID: ActionResult = { ok: false, error: errorCopy('invalid_input') }

function copy(error: Failure): string {
  return typeof error === 'string'
    ? errorCopy(error)
    : `The card processor reported a problem: ${error.detail}`
}

function done(result: { ok: true } | { ok: false; error: Failure }, message: string): ActionResult {
  return result.ok ? { ok: true, message } : { ok: false, error: copy(result.error) }
}

export async function refundAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const entryId = text(formData, 'entryId')
    const amountCents = dollarsToCents(text(formData, 'amount'))
    const applicationId = text(formData, 'applicationId')
    if (!isUuid(entryId) || amountCents === null || amountCents <= 0) return INVALID
    const result = await refundEntry(
      db,
      actor,
      {
        entryId,
        amountCents,
        reason: text(formData, 'reason'),
        ...(isUuid(applicationId) ? { applicationId } : {}),
      },
      signal,
    )
    if (result.ok && result.value.pending) {
      return {
        ok: true,
        message: 'Refund sent. The processor has not completed it yet, so it is not in the ledger.',
      }
    }
    return done(
      result,
      `Refund recorded on receipt ${result.ok ? result.value.receiptNumber : ''}.`,
    )
  })
}

export async function returnedCheckAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const entryId = text(formData, 'entryId')
    const returnedOn = parseCivilDate(text(formData, 'returnedOn'))
    if (!isUuid(entryId) || !returnedOn.ok) return INVALID
    const result = await recordReturnedCheck(
      db,
      actor,
      { entryId, returnedOn: returnedOn.value, reason: text(formData, 'reason') },
      signal,
    )
    return done(result, 'Returned check recorded. The permit state did not change.')
  })
}

export async function chargebackAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const entryId = text(formData, 'entryId')
    const amountCents = dollarsToCents(text(formData, 'amount'))
    const disputeRef = text(formData, 'disputeRef')
    if (!isUuid(entryId) || amountCents === null || amountCents <= 0 || disputeRef === '')
      return INVALID
    const result = await recordChargeback(
      db,
      actor,
      { entryId, amountCents, disputeRef, reason: text(formData, 'reason') },
      signal,
    )
    return done(result, 'Chargeback recorded.')
  })
}

export async function correctAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const entryId = text(formData, 'entryId')
    const toApplicationId = text(formData, 'targetApplicationId')
    const amountCents = dollarsToCents(text(formData, 'amount'))
    if (!isUuid(entryId) || !isUuid(toApplicationId) || amountCents === null || amountCents <= 0) {
      return INVALID
    }
    const result = await moveFunds(
      db,
      actor,
      { entryId, toApplicationId, amountCents, reason: text(formData, 'reason') },
      signal,
    )
    return done(result, 'Correction recorded.')
  })
}

export async function checkWithProcessorAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const attemptId = text(formData, 'attemptId')
    if (!isUuid(attemptId)) return INVALID
    const result = await checkWithProcessor(db, actor, attemptId, signal)
    return result.ok
      ? { ok: true, message: `The processor reports this attempt as ${result.value.state}.` }
      : { ok: false, error: copy(result.error) }
  })
}

export async function voidAttemptAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const attemptId = text(formData, 'attemptId')
    if (!isUuid(attemptId)) return INVALID
    const result = await voidAttempt(
      db,
      actor,
      { attemptId, reason: text(formData, 'reason') },
      signal,
    )
    return done(result, 'Attempt voided.')
  })
}

const COUNTER_METHODS = ['cash', 'check'] as const

export async function recordPaymentAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = text(formData, 'applicationId')
    const method = COUNTER_METHODS.find((m) => m === text(formData, 'method'))
    const amountCents = dollarsToCents(text(formData, 'amount'))
    const tenderedText = text(formData, 'tendered')
    const tenderedCents = tenderedText === '' ? undefined : dollarsToCents(tenderedText)
    const payerName = text(formData, 'payerName')
    if (
      !isUuid(applicationId) ||
      method === undefined ||
      amountCents === null ||
      amountCents <= 0 ||
      tenderedCents === null ||
      payerName === ''
    ) {
      return INVALID
    }
    const result = await recordApplicationPayment(
      db,
      actor,
      {
        applicationId,
        method,
        amountCents,
        tenderedCents,
        checkNumber: text(formData, 'checkNumber'),
        payerName,
      },
      signal,
    )
    if (!result.ok) return { ok: false, error: copy(result.error) }
    const change =
      result.value.changeCents > 0 ? ` Change due ${formatCents(result.value.changeCents)}.` : ''
    return {
      ok: true,
      message: `Payment recorded on receipt ${result.value.receiptNumber}.${change}`,
    }
  })
}
