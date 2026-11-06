import { z } from 'zod'
import { COUNSEL_OUTCOME_KINDS, COUNSEL_PURPOSES, FINE_KINDS } from '@/db/schema'
import { optionalRecordId } from '@/features/input/optionalRecordId'
import {
  choice,
  civilDate,
  inputField,
  moneyCents,
  optionalText,
  recordId,
  requiredText,
} from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export type FineBasis = { orderId: string; judgmentStepId: string } | { counselOutcomeId: string }

const BASIS_MESSAGE = 'Choose what the fine is based on.'

const fineBasis = () =>
  inputField((raw): Result<FineBasis, string> => {
    const [head, tail, ...rest] = (typeof raw === 'string' ? raw.trim() : '').split(':')
    if (tail === undefined || rest.length > 0 || !isUuid(tail)) return err(BASIS_MESSAGE)
    if (head === 'counsel') return ok({ counselOutcomeId: tail })
    return head !== undefined && isUuid(head)
      ? ok({ orderId: head, judgmentStepId: tail })
      : err(BASIS_MESSAGE)
  })

export const recordFineForm = (today: CivilDate) =>
  z
    .object({
      caseId: recordId('a case'),
      basis: fineBasis(),
      kind: choice('a kind of fine', FINE_KINDS),
      dollars: moneyCents('the amount'),
      imposedOn: civilDate('the date imposed', { latest: today }),
      court: requiredText('the court', { max: 200 }),
      docket: requiredText('the docket number', { max: 100 }),
    })
    .transform(({ dollars, ...rest }) => ({ ...rest, amountCents: dollars }))

export const referToCounselForm = (today: CivilDate) =>
  z.object({
    caseId: recordId('a case'),
    counselName: requiredText('the counsel', { max: 200 }),
    purpose: choice('a purpose', COUNSEL_PURPOSES),
    referredOn: civilDate('the date referred', { latest: today }),
  })

export const counselOutcomeForm = (today: CivilDate) =>
  z.object({
    referralId: recordId('a referral'),
    kind: choice('what happened', COUNSEL_OUTCOME_KINDS),
    occurredOn: civilDate('the date', { latest: today }),
    court: optionalText('the court', { max: 200 }),
    docket: optionalText('the docket number', { max: 100 }),
    documentId: optionalRecordId('Choose a document.'),
    note: optionalText('a note', { max: 2000 }),
  })

export const FINE_PAYMENT_FORM = z
  .object({
    fineId: recordId('a fine'),
    dollars: moneyCents('the amount'),
    method: choice('how it was paid', ['cash', 'check'] as const),
    checkNumber: optionalText('the check number', { max: 50 }),
    payerName: requiredText('the payer name', { max: 200 }),
  })
  .superRefine((value, ctx) => {
    if (value.method === 'check' && value.checkNumber === null) {
      ctx.addIssue({ code: 'custom', path: ['checkNumber'], message: 'Enter the check number.' })
    }
  })
  .transform(({ dollars, ...rest }) => ({ ...rest, amountCents: dollars }))
