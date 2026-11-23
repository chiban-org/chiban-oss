import { z } from 'zod'
import { base } from './rules'

export const RECIPIENT_ROLES = [
  'record_owner',
  'owner_agent',
  'taxpayer',
  'occupying_tenant',
  'person_in_control',
  'mortgagee_of_record',
] as const
export const RecipientRoleSchema = z.enum(RECIPIENT_ROLES)
export type RecipientRole = z.infer<typeof RecipientRoleSchema>

export const PERSONAL_SERVER_ROLES = [
  'sheriff',
  'deputy_sheriff',
  'local_police_officer',
  'constable',
] as const
export const PersonalServerRoleSchema = z.enum(PERSONAL_SERVER_ROLES)
export type PersonalServerRole = z.infer<typeof PersonalServerRoleSchema>

export const ORDER_CONTENT_FIELDS = [
  'provisions',
  'facts',
  'inspectionDate',
  'correctiveAction',
  'correctiveDeadline',
  'motionNotice',
  'lienWarning',
] as const
export const OrderContentFieldSchema = z.enum(ORDER_CONTENT_FIELDS)
export type OrderContentField = z.infer<typeof OrderContentFieldSchema>

export const CeaseAndDesistRuleSchema = z.object({
  ...base,
  kind: z.literal('cease_and_desist'),
  contentFields: z.array(OrderContentFieldSchema).min(1),
  issuerMustBeDesignated: z.boolean(),
  recipientRoles: z.array(RecipientRoleSchema).min(1),
  ownerRoles: z.array(RecipientRoleSchema).min(1),
  personalServerRoles: z.array(PersonalServerRoleSchema).min(1),
  ownerNotFoundFallback: z.object({
    posting: z.boolean(),
    publicationWeeks: z.number().int().positive(),
  }),
  answerRuleKey: z.string().min(1),
  courtFilingLeadDays: z.number().int().min(0),
  judgmentAppealRuleKey: z.string().min(1),
  penaltyRuleKey: z.string().min(1),
  overridePolicy: z.object({ policy: z.literal('fixed') }),
})
export type CeaseAndDesistRule = z.infer<typeof CeaseAndDesistRuleSchema>

const statedAccrual = z.literal('after_earlier_of_conviction_or_written_notice')

const penaltyBase = {
  ...base,
  kind: z.literal('civil_penalty'),
  imposedBy: z.literal('court'),
  overridePolicy: z.object({ policy: z.literal('fixed') }),
}

export const FixedDailyPenaltySchema = z.object({
  ...penaltyBase,
  model: z.literal('fixed_daily').default('fixed_daily'),
  accrual: statedAccrual,
  firstOffenseCentsPerDay: z.number().int().positive(),
  subsequentCentsPerDay: z.number().int().positive(),
})

export const RangeDailyPenaltySchema = z.object({
  ...penaltyBase,
  model: z.literal('range_daily'),
  accrual: statedAccrual.nullable(),
  categories: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        minCentsPerDay: z.number().int().positive(),
        maxCentsPerDay: z.number().int().positive(),
      }),
    )
    .min(1),
  aggravations: z.array(
    z
      .object({
        key: z.string().min(1),
        label: z.string().min(1),
        maxCentsPerDay: z.number().int().positive().optional(),
        maxMultipleOfBenefit: z.number().positive().optional(),
      })
      .refine((a) => (a.maxCentsPerDay === undefined) !== (a.maxMultipleOfBenefit === undefined), {
        message: 'An aggravation sets exactly one of maxCentsPerDay and maxMultipleOfBenefit',
      }),
  ),
})

export const CivilPenaltyRuleSchema = z.union([FixedDailyPenaltySchema, RangeDailyPenaltySchema])
export type CivilPenaltyRule = z.infer<typeof CivilPenaltyRuleSchema>

export const CureNoticeRuleSchema = z.object({
  ...base,
  kind: z.literal('cure_notice'),
  occupant: z.literal('if_applicable'),
  method: z.literal('certified_mail_return_receipt'),
  cureRuleKey: z.string().min(1),
  penaltyRuleKey: z.string().min(1).nullable(),
  remedies: z.object({ developmentHold: z.boolean(), civilAction: z.boolean() }),
  overridePolicy: z.object({ policy: z.literal('fixed') }),
})
export type CureNoticeRule = z.infer<typeof CureNoticeRuleSchema>
