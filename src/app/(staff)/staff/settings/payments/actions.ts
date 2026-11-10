'use server'

import { env } from '@/config/env'
import { saveProcessorAccount } from '@/features/payments/processorAccounts'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { PROCESSOR_FORM, type ProcessorValues } from './forms'

function material(input: ProcessorValues): {
  credentials: Record<string, unknown>
  settings: Record<string, unknown>
} {
  const secretKey = trimmedText(input.secretKey)
  const device = input.deviceId === null ? {} : { deviceId: input.deviceId }
  if (input.processor === 'stripe') return { credentials: { secretKey }, settings: device }
  if (input.processor === 'clover') {
    return {
      credentials: { privateToken: secretKey, webhookSigningSecret: input.webhookSecret },
      settings: {
        apiBase: trimmedText(input.apiBase),
        ecommBase: trimmedText(input.ecommBase),
        ...device,
      },
    }
  }
  return { credentials: {}, settings: {} }
}

function trimmedText(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

export async function saveProcessorAccountAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    PROCESSOR_FORM,
    async ({ db, actor, signal }, input) => {
      const result = await saveProcessorAccount(
        db,
        actor,
        {
          processor: input.processor,
          mode: input.mode,
          accountRef: input.accountRef,
          webhookSecret: input.webhookSecret,
          ...material(input),
        },
        signal,
        { simulatedEnabled: env.ENABLE_SIMULATED_PAYMENTS },
      )
      if (result.ok) {
        return {
          ok: true,
          message: 'Processor account saved. The connection has not been verified yet.',
        }
      }
      if (result.error === 'simulated_disabled') {
        return refuseField('processor', errorCopy(result.error))
      }
      return { ok: false, error: errorCopy(result.error) }
    },
    { lockedInDemo: true },
  )
}
