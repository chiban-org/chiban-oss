import { z } from 'zod'

export const CONVENIENCE_FEE_CHANNELS = ['card_online', 'card_present'] as const

export const PaymentSettingsBodySchema = z.object({
  key: z.literal('default'),
  convenienceFee: z.object({
    basisPoints: z.number().int().min(0).max(10_000),
    fixedCents: z.number().int().min(0),
    appliesTo: z.array(z.enum(CONVENIENCE_FEE_CHANNELS)),
  }),
  receiptFooter: z.string(),
  checksPayableTo: z.string().min(1),
})

export type PaymentSettingsBody = z.infer<typeof PaymentSettingsBodySchema>

export const NO_CONVENIENCE_FEE: PaymentSettingsBody['convenienceFee'] = {
  basisPoints: 0,
  fixedCents: 0,
  appliesTo: [],
}
