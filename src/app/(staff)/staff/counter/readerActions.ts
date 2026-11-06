'use server'

import { z } from 'zod'
import type { ReaderStatus } from '@/components/counter/counterTypes'
import { db } from '@/db/client'
import { choice, recordId } from '@/features/input/schemas'
import {
  checkWithProcessor,
  reconnectSimulatedReader,
  resolveSimulatedReader,
} from '@/features/payments/startPayment'
import { copyFor, failReader, guardedForm } from './counterGuard'

const ATTEMPT_FORM = z.object({ attemptId: recordId('a card payment') })

const READER_FORM = z.object({
  attemptId: recordId('a card payment'),
  outcome: choice('an outcome', ['captured', 'declined', 'unknown'] as const),
})

const RECONNECT_FORM = z.object({
  attemptId: recordId('a card payment'),
  outcome: choice('an outcome', ['captured', 'declined'] as const),
})

export async function readerAction(formData: FormData): Promise<ReaderStatus> {
  return await guardedForm(formData, READER_FORM, failReader, async ({ actor, signal }, input) => {
    const result = await resolveSimulatedReader(db, actor, input, signal)
    return result.ok
      ? { ok: true, state: result.value.state, outcomeUnknown: result.value.outcomeUnknown }
      : failReader(copyFor(result.error))
  })
}

export async function checkAction(formData: FormData): Promise<ReaderStatus> {
  return await guardedForm(formData, ATTEMPT_FORM, failReader, async ({ actor, signal }, input) => {
    const result = await checkWithProcessor(db, actor, input.attemptId, signal)
    return result.ok
      ? { ok: true, state: result.value.state, outcomeUnknown: result.value.outcomeUnknown }
      : failReader(copyFor(result.error))
  })
}

export async function reconnectAction(formData: FormData): Promise<ReaderStatus> {
  return await guardedForm(
    formData,
    RECONNECT_FORM,
    failReader,
    async ({ actor, signal }, input) => {
      const reconnected = await reconnectSimulatedReader(db, actor, input, signal)
      if (!reconnected.ok) return failReader(copyFor(reconnected.error))
      const checked = await checkWithProcessor(db, actor, input.attemptId, signal)
      return checked.ok
        ? { ok: true, state: checked.value.state, outcomeUnknown: checked.value.outcomeUnknown }
        : failReader(copyFor(checked.error))
    },
  )
}
