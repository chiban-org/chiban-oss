'use server'

import { z } from 'zod'
import { env } from '@/config/env'
import { PROCESSORS } from '@/features/ledger/types'
import { saveProcessorAccount } from '@/features/payments/processorAccounts'
import {
  CloverCredentialsSchema,
  CloverSettingsSchema,
} from '@/features/payments/processors/clover'
import { StripeCredentialsSchema } from '@/features/payments/processors/stripe'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'

const INVALID: ActionResult = { ok: false, error: errorCopy('invalid_input') }
const FormSchema = z.object({
  processor: z.enum(PROCESSORS),
  mode: z.enum(['test', 'live']),
  accountRef: z.string().min(1),
})

function material(
  processor: (typeof PROCESSORS)[number],
  data: FormData,
): { credentials: Record<string, unknown>; settings: Record<string, unknown> } | null {
  const secretKey = text(data, 'secretKey')
  const webhookSecret = text(data, 'webhookSecret')
  const deviceId = text(data, 'deviceId')
  const device = deviceId === '' ? {} : { deviceId }
  if (processor === 'stripe') {
    const credentials = StripeCredentialsSchema.safeParse({ secretKey })
    return credentials.success ? { credentials: credentials.data, settings: device } : null
  }
  if (processor === 'clover') {
    const credentials = CloverCredentialsSchema.safeParse({
      privateToken: secretKey,
      webhookSigningSecret: webhookSecret,
    })
    const settings = CloverSettingsSchema.safeParse({
      apiBase: text(data, 'apiBase'),
      ecommBase: text(data, 'ecommBase'),
      ...device,
    })
    return credentials.success && settings.success
      ? { credentials: credentials.data, settings: settings.data }
      : null
  }
  return { credentials: {}, settings: {} }
}

export async function saveProcessorAccountAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const parsed = FormSchema.safeParse({
      processor: text(formData, 'processor'),
      mode: text(formData, 'mode'),
      accountRef: text(formData, 'accountRef'),
    })
    const webhookSecret = text(formData, 'webhookSecret')
    const parts = parsed.success ? material(parsed.data.processor, formData) : null
    if (!parsed.success || parts === null || webhookSecret === '') return INVALID
    const result = await saveProcessorAccount(
      db,
      actor,
      { ...parsed.data, ...parts, webhookSecret },
      signal,
      { simulatedEnabled: env.ENABLE_SIMULATED_PAYMENTS },
    )
    return result.ok
      ? { ok: true, message: 'Processor account saved. The connection has not been verified yet.' }
      : { ok: false, error: errorCopy(result.error) }
  })
}
