'use server'

import type { CardStartResult } from '@/app/(staff)/staff/applications/[applicationId]/cardTypes'
import { guardedForm } from '@/app/(staff)/staff/counter/counterGuard'
import { db } from '@/db/client'
import {
  type ApplicationCardError,
  startApplicationCardPayment,
} from '@/features/counter/applicationCardPayment'
import { loadCardReader } from '@/features/payments/cardReader'
import { errorCopy } from '@/server/actionRunner'
import { START_CARD_FORM } from './paymentForms'

const failCard = (error: string): CardStartResult => ({ ok: false, error })

const OPEN_ATTEMPT =
  'A card payment on this application is still waiting on the processor. Reload the record to check it or void it.'

async function noReaderReason(signal: AbortSignal): Promise<string> {
  const reader = await loadCardReader(db, signal)
  return reader.available ? errorCopy('not_configured') : reader.reason
}

async function cardRefusalCopy(error: ApplicationCardError, signal: AbortSignal): Promise<string> {
  if (typeof error !== 'string') return `The card processor reported a problem: ${error.detail}`
  if (error === 'card_attempt_open') return OPEN_ATTEMPT
  if (error === 'no_reader') return await noReaderReason(signal)
  return errorCopy(error)
}

export async function startCardAction(formData: FormData): Promise<CardStartResult> {
  return await guardedForm(
    formData,
    START_CARD_FORM,
    failCard,
    async ({ actor, signal }, input) => {
      const started = await startApplicationCardPayment(db, actor, input, signal)
      if (!started.ok) return failCard(await cardRefusalCopy(started.error, signal))
      const { attemptId, outcomeUnknown } = started.value
      return { ok: true, attemptId, outcomeUnknown }
    },
  )
}
