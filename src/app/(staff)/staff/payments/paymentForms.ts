import { z } from 'zod'
import { optionalRecordId } from '@/features/input/optionalRecordId'
import {
  choice,
  civilDate,
  moneyCents,
  optionalMoneyCents,
  optionalText,
  recordId,
  requiredText,
} from '@/features/input/schemas'
import { MIN_REASON_LENGTH } from '@/features/ledger/reversalSupport'
import { MANUAL_OUTCOMES } from '@/features/payments/manualOutcomeCheck'
import type { CivilDate } from '@/types/civilDate'

const REASON_MAX = 2000

const reason = () => requiredText('a reason', { min: MIN_REASON_LENGTH, max: REASON_MAX })

const entryId = () => recordId('a payment')

const attemptId = () => recordId('an attempt')

const renamed = <T extends { amount: number }>({ amount, ...rest }: T) => ({
  ...rest,
  amountCents: amount,
})

export const REFUND_FORM = z
  .object({
    entryId: entryId(),
    applicationId: optionalRecordId('Choose an application.'),
    amount: moneyCents('the refund amount'),
    reason: reason(),
  })
  .transform(renamed)

export const returnedCheckForm = (today: CivilDate) =>
  z.object({
    entryId: entryId(),
    returnedOn: civilDate('the date returned', { latest: today }),
    reason: reason(),
  })

export const CHARGEBACK_FORM = z
  .object({
    entryId: entryId(),
    disputeRef: requiredText('the dispute reference', { max: 100 }),
    amount: moneyCents('the chargeback amount'),
    reason: reason(),
  })
  .transform(renamed)

export const CORRECT_FORM = z
  .object({
    entryId: entryId(),
    targetApplicationId: recordId('a permit to move it to'),
    amount: moneyCents('the amount to move'),
    reason: reason(),
  })
  .transform(renamed)

export const CHECK_WITH_PROCESSOR_FORM = z.object({ attemptId: attemptId() })

export const VOID_ATTEMPT_FORM = z.object({ attemptId: attemptId(), reason: reason() })

export const OUTCOME_BY_HAND_FORM = z.object({
  attemptId: attemptId(),
  outcome: choice('what the processor confirmed', MANUAL_OUTCOMES),
  processorRef: optionalText('the processor reference', { max: 200 }),
  note: requiredText('a note', { min: MIN_REASON_LENGTH, max: REASON_MAX }),
})

export const RECORD_PAYMENT_FORM = z
  .object({
    applicationId: recordId('an application'),
    method: choice('how it was paid', ['cash', 'check'] as const),
    amount: moneyCents('the amount'),
    checkNumber: optionalText('the check number', { max: 50 }),
    tendered: optionalMoneyCents('the cash tendered'),
    payerName: requiredText('the payer name', { max: 200 }),
  })
  .superRefine((value, ctx) => {
    if (value.method === 'check' && value.checkNumber === null) {
      ctx.addIssue({ code: 'custom', path: ['checkNumber'], message: 'Enter the check number.' })
    }
  })
  .transform(renamed)

export const START_CARD_FORM = z.object({
  applicationId: recordId('an application'),
  payerName: requiredText('the payer name', { max: 200 }),
})
