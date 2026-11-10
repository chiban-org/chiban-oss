import { BoardKindSchema } from '@packs/nh/boardSchema'
import { z } from 'zod'
import { FEE_STAGES, FeeExprSchema, MAX_FEE_CENTS } from '@/features/fees/feeSchema'
import { FormFieldSchema } from '@/features/forms/formSchema'
import { PaymentSettingsBodySchema } from '@/features/payments/settingsSchema'
import { TownProfileBodySchema } from '@/features/town/profileSchema'

export const DEMO_OVERLAY_VERSION = 1

const text = z.string().trim().min(1)
const cents = z.number().int().nonnegative().max(MAX_FEE_CENTS)
const TypeKeySchema = z.string().regex(/^[A-Z]{1,4}$/, 'Use the application type key, such as BP.')
const FeeCodeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'Use a fee line code, such as building.')

export const OverlayFeeLineSchema = z.strictObject({
  label: text.optional(),
  due: z.enum(FEE_STAGES).optional(),
  expr: FeeExprSchema,
})
export type OverlayFeeLine = z.infer<typeof OverlayFeeLineSchema>

export const OverlayTypeSchema = z.strictObject({
  formFields: z.array(FormFieldSchema).min(1).optional(),
  fees: z.record(FeeCodeSchema, OverlayFeeLineSchema).optional(),
})
export type OverlayType = z.infer<typeof OverlayTypeSchema>

export const OverlayNoticeFeesSchema = z.strictObject({
  perAbutterCents: cents.optional(),
  advertisingCents: cents.optional(),
})
export type OverlayNoticeFees = z.infer<typeof OverlayNoticeFeesSchema>

const OverlayBoardSchema = z.strictObject({
  notice: z
    .strictObject({
      posting: z.boolean().optional(),
      publication: z.boolean().optional(),
      newspaper: text.nullable().optional(),
      bulletinBoards: z.array(text).optional(),
      websiteUrl: z.url().nullable().optional(),
    })
    .optional(),
  noticeFees: OverlayNoticeFeesSchema.optional(),
})
export type OverlayBoard = z.infer<typeof OverlayBoardSchema>

const BoardLetterheadSchema = z.strictObject({
  officeName: text.optional(),
  addressLines: z.array(text).min(1).max(3).optional(),
  footerText: z.string().trim().optional(),
})

const profile = TownProfileBodySchema.shape

const OverlayProfileSchema = z.strictObject({
  officeName: profile.officeName.optional(),
  addressLines: profile.addressLines.optional(),
  phone: profile.phone.optional(),
  email: profile.email.optional(),
  website: profile.website.optional(),
  officeHours: profile.officeHours.optional(),
  letterheadFooter: z.string().trim().optional(),
  boards: z.partialRecord(BoardKindSchema, BoardLetterheadSchema).optional(),
})
export type OverlayProfile = z.infer<typeof OverlayProfileSchema>

const payments = PaymentSettingsBodySchema.shape

const OverlayPaymentsSchema = z.strictObject({
  receiptFooter: payments.receiptFooter.optional(),
  checksPayableTo: payments.checksPayableTo.optional(),
  convenienceFee: z.strictObject(payments.convenienceFee.shape).optional(),
})

export const DemoOverlaySchema = z
  .strictObject({
    version: z.literal(DEMO_OVERLAY_VERSION),
    town: z.strictObject({ name: text }).optional(),
    townProfile: OverlayProfileSchema.optional(),
    paymentSettings: OverlayPaymentsSchema.optional(),
    starters: z.array(TypeKeySchema).optional(),
    boards: z.partialRecord(BoardKindSchema, OverlayBoardSchema).optional(),
    applicationTypes: z.record(TypeKeySchema, OverlayTypeSchema).optional(),
  })
  .superRefine((overlay, ctx) => {
    const listed = new Set<string>()
    for (const [i, key] of (overlay.starters ?? []).entries()) {
      if (listed.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['starters', i], message: `${key} is listed twice` })
      }
      listed.add(key)
    }
    for (const key of Object.keys(overlay.applicationTypes ?? {})) {
      if (!listed.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['applicationTypes', key],
          message: `${key} is not in starters; list it there so it is adopted first`,
        })
      }
    }
  })
export type DemoOverlay = z.infer<typeof DemoOverlaySchema>
