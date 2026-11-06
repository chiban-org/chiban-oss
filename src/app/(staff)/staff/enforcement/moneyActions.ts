'use server'

import { recordCounterPayment } from '@/features/counter/counterPayment'
import { recordCounselOutcome, referToCounsel } from '@/features/enforcement/counsel'
import { recordFine } from '@/features/enforcement/fines'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import { settled } from './enforcementResult'
import {
  counselOutcomeForm,
  FINE_PAYMENT_FORM,
  recordFineForm,
  referToCounselForm,
} from './moneyForms'

export async function fineAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, recordFineForm, async ({ db, actor, signal }, input) => {
    const { basis, ...rest } = input
    return settled(await recordFine(db, actor, { ...rest, ...basis }, signal), 'Fine recorded.', {
      judgment_required: 'basis',
    })
  })
}

export async function referAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    referToCounselForm,
    async ({ db, actor, signal }, input) =>
      settled(
        await referToCounsel(db, getObjectStore(), actor, input, signal),
        'Referred to counsel. The packet is on the case.',
      ),
  )
}

export async function outcomeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    counselOutcomeForm,
    async ({ db, actor, signal }, input) => {
      const { court, docket, documentId, note, ...rest } = input
      return settled(
        await recordCounselOutcome(
          db,
          actor,
          {
            ...rest,
            ...(court === null ? {} : { court }),
            ...(docket === null ? {} : { docket }),
            ...(documentId === null ? {} : { documentId }),
            ...(note === null ? {} : { note }),
          },
          signal,
        ),
        'Outcome recorded.',
        { document_invalid: 'documentId' },
      )
    },
  )
}

export async function finePaymentAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, FINE_PAYMENT_FORM, async ({ db, actor, signal }, input) => {
    const paid = await recordCounterPayment(
      db,
      actor,
      {
        method: input.method,
        amountCents: input.amountCents,
        payerName: input.payerName,
        ...(input.checkNumber === null ? {} : { checkNumber: input.checkNumber }),
        allocations: [{ targetKind: 'fine', fineId: input.fineId, amountCents: input.amountCents }],
      },
      signal,
    )
    return settled(paid, 'Payment recorded.', {
      over_allocated: 'dollars',
      check_number_required: 'checkNumber',
    })
  })
}
