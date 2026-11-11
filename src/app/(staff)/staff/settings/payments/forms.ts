import { z } from 'zod'
import { trimmed } from '@/features/input/field'
import { choice, inputField, optionalText, requiredText } from '@/features/input/schemas'
import { PROCESSORS } from '@/features/ledger/types'
import { err, ok } from '@/types/result'

const MAX_TEXT = 500

const webAddress = (noun: string) =>
  inputField((raw) => {
    const value = trimmed(raw)
    if (value === '') return err(`Enter ${noun}.`)
    return URL.canParse(value) && value.length <= MAX_TEXT
      ? ok(value)
      : err(`Enter ${noun} as a web address starting with https://.`)
  })

const secret = (noun: string) => requiredText(noun, { max: MAX_TEXT })

const optionalUnknown = z.unknown().optional()

export const PROCESSOR_FORM = z
  .object({
    processor: choice('a processor', PROCESSORS),
    mode: choice('a mode', ['test', 'live'] as const),
    accountRef: requiredText('the account number at the processor', { max: 200 }),
    webhookSecret: optionalText('the webhook signing secret', { max: MAX_TEXT }),
    deviceId: optionalText('the card reader device ID', { max: 200 }),
    secretKey: optionalUnknown,
    apiBase: optionalUnknown,
    ecommBase: optionalUnknown,
  })
  .superRefine((value, ctx) => {
    const report = (field: string, parsed: { success: boolean; error?: z.ZodError }) => {
      for (const issue of parsed.error?.issues ?? []) {
        ctx.addIssue({ code: 'custom', path: [field], message: issue.message })
      }
    }
    if (value.processor === 'simulated') return
    report('secretKey', secret('the secret key').safeParse(value.secretKey))
    if (value.processor === 'clover') {
      report('apiBase', webAddress('the Clover API address').safeParse(value.apiBase))
      report('ecommBase', webAddress('the Clover checkout address').safeParse(value.ecommBase))
    }
  })

export type ProcessorValues = z.output<typeof PROCESSOR_FORM>
