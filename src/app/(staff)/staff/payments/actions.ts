'use server'

import { recordApplicationPayment } from '@/features/counter/applicationPayment'
import { moveFunds } from '@/features/ledger/moveFunds'
import { recordChargeback, recordReturnedCheck, refundEntry } from '@/features/ledger/reversals'
import { recordOutcomeByHand } from '@/features/payments/manualOutcome'
import { checkWithProcessor, voidAttempt } from '@/features/payments/startPayment'
import { formatCents } from '@/lib/money'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import {
  CHARGEBACK_FORM,
  CHECK_WITH_PROCESSOR_FORM,
  CORRECT_FORM,
  OUTCOME_BY_HAND_FORM,
  RECORD_PAYMENT_FORM,
  REFUND_FORM,
  returnedCheckForm,
  VOID_ATTEMPT_FORM,
} from './paymentForms'

type Failure = string | { kind: string; detail: string }

type FieldOf = Readonly<Record<string, string>>

const REASON_FIELD: FieldOf = { reason_required: 'reason' }

function copy(error: Failure): string {
  return typeof error === 'string'
    ? errorCopy(error)
    : `The card processor reported a problem: ${error.detail}`
}

function settled(
  result: { ok: true } | { ok: false; error: Failure },
  message: string,
  fieldOf: FieldOf = REASON_FIELD,
): ActionResult {
  if (result.ok) return { ok: true, message }
  const field = typeof result.error === 'string' ? fieldOf[result.error] : undefined
  return field === undefined
    ? { ok: false, error: copy(result.error) }
    : refuseField(field, copy(result.error))
}

export async function refundAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, REFUND_FORM, async ({ db, actor, signal }, input) => {
    const { applicationId, fineId, ...rest } = input
    const result = await refundEntry(
      db,
      actor,
      {
        ...rest,
        ...(applicationId === null ? {} : { applicationId }),
        ...(fineId === null ? {} : { fineId }),
      },
      signal,
    )
    if (result.ok && result.value.pending) {
      return {
        ok: true,
        message: 'Refund sent. The processor has not completed it yet, so it is not in the ledger.',
      }
    }
    return settled(
      result,
      `Refund recorded on receipt ${result.ok ? result.value.receiptNumber : ''}.`,
      { ...REASON_FIELD, over_reversed: 'amount' },
    )
  })
}

export async function returnedCheckAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    returnedCheckForm,
    async ({ db, actor, signal }, { fineId, ...input }) =>
      settled(
        await recordReturnedCheck(db, actor, input, signal),
        fineId === null
          ? 'Returned check recorded. The permit state did not change.'
          : 'Returned check recorded. The amount is due on the fine again.',
      ),
  )
}

export async function chargebackAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, CHARGEBACK_FORM, async ({ db, actor, signal }, input) =>
    settled(await recordChargeback(db, actor, input, signal), 'Chargeback recorded.', {
      ...REASON_FIELD,
      over_reversed: 'amount',
    }),
  )
}

export async function correctAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, CORRECT_FORM, async ({ db, actor, signal }, input) =>
    settled(
      await moveFunds(db, actor, { ...input, toApplicationId: input.targetApplicationId }, signal),
      'Correction recorded.',
      { ...REASON_FIELD, no_fee_line: 'amount', over_reversed: 'amount' },
    ),
  )
}

export async function checkWithProcessorAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    CHECK_WITH_PROCESSOR_FORM,
    async ({ db, actor, signal }, { attemptId }) => {
      const result = await checkWithProcessor(db, actor, attemptId, signal)
      if (!result.ok) return { ok: false, error: copy(result.error) }
      const { state, processorStatus, byHand } = result.value
      return {
        ok: true,
        message:
          byHand === true && processorStatus !== undefined
            ? `The processor reports this payment as ${processorStatus}. The outcome recorded by hand stands.`
            : `The processor reports this attempt as ${state}.`,
      }
    },
  )
}

export async function voidAttemptAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, VOID_ATTEMPT_FORM, async ({ db, actor, signal }, input) =>
    settled(await voidAttempt(db, actor, input, signal), 'Attempt voided.'),
  )
}

export async function recordOutcomeByHandAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    OUTCOME_BY_HAND_FORM,
    async ({ db, actor, signal }, { processorRef, ...input }) =>
      settled(
        await recordOutcomeByHand(
          db,
          actor,
          { ...input, ...(processorRef === null ? {} : { processorRef }) },
          signal,
        ),
        input.outcome === 'approved'
          ? 'Recorded as approved. The payment is in the ledger.'
          : 'Recorded as declined. The attempt is closed.',
        {
          note_required: 'note',
          reference_required: 'processorRef',
          reference_in_use: 'processorRef',
        },
      ),
  )
}

export async function recordPaymentAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RECORD_PAYMENT_FORM, async ({ db, actor, signal }, input) => {
    const { tendered, checkNumber, ...rest } = input
    const result = await recordApplicationPayment(
      db,
      actor,
      {
        ...rest,
        ...(tendered === null ? {} : { tenderedCents: tendered }),
        ...(checkNumber === null ? {} : { checkNumber }),
      },
      signal,
    )
    if (!result.ok) {
      return settled(result, '', {
        over_allocated: 'amount',
        tendered_short: 'tendered',
        check_number_required: 'checkNumber',
      })
    }
    const change =
      result.value.changeCents > 0 ? ` Change due ${formatCents(result.value.changeCents)}.` : ''
    return {
      ok: true,
      message: `Payment recorded on receipt ${result.value.receiptNumber}.${change}`,
    }
  })
}
