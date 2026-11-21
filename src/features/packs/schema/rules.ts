import { z } from 'zod'
import { RecipientRoleSchema as AbutterRecipientRoleSchema } from '@/features/abutters/roles'
import { CORE_STATES } from '@/features/applications/states'
import { NOTICE_CHANNELS } from '@/features/notices/channels'
import { type CivilDate, parseCivilDate } from '@/types/civilDate'
import { BoardKindSchema } from './boards'

export const civilDateSchema = z
  .string()
  .refine((s) => parseCivilDate(s).ok, 'invalid civil date')
  .transform((s) => s as CivilDate)

export const CitationSchema = z.object({
  label: z.string().min(1),
  url: z.string().url().nullable(),
})

export const OverridePolicySchema = z.discriminatedUnion('policy', [
  z.object({ policy: z.literal('fixed') }),
  z.object({ policy: z.literal('minimum'), floor: z.number() }),
  z.object({ policy: z.literal('maximum'), ceiling: z.number() }),
  z.object({
    policy: z.literal('delegated_choice'),
    range: z.object({ min: z.number(), max: z.number() }).optional(),
    default: z.number(),
  }),
  z.object({ policy: z.literal('locally_prohibited') }),
])
export type OverridePolicy = z.infer<typeof OverridePolicySchema>

const CoreStateSchema = z.enum(CORE_STATES)

export const StartEventSchema = z.enum([
  'application_received',
  'application_completed',
  'permit_issued',
  'regional_impact_notice_mailed',
  'acceptance_meeting_set',
  'application_accepted',
  'hearing_held',
  'final_approval',
  'board_vote',
  'decision_filed',
  'rehearing_vote',
  'administrative_decision',
  'order_served',
  'judgment_entered',
  'rtk_request_received',
  'rtk_time_statement',
])
export type StartEvent = z.infer<typeof StartEventSchema>

export const DECISION_OUTCOMES = [
  'approved',
  'approved_with_conditions',
  'denied',
  'rehearing_granted',
  'rehearing_denied',
] as const
const DecisionOutcomeSchema = z.enum(DECISION_OUTCOMES)
export type DecisionOutcome = z.infer<typeof DecisionOutcomeSchema>

export const FactConditionSchema = z.union([
  z.object({
    fact: z.literal('classification'),
    in: z.array(z.enum(['residential', 'nonresidential'])).min(1),
  }),
  z.object({ fact: z.literal('dwellingUnits'), gt: z.number() }),
  z.object({ fact: z.literal('regionalImpact'), is: z.literal(true) }),
  z.object({ fact: z.literal('decisionFiledLate'), is: z.literal(true) }),
  z.object({ fact: z.literal('outcome'), in: z.array(DecisionOutcomeSchema).min(1) }),
])
export type FactCondition = z.infer<typeof FactConditionSchema>

const LengthSchema = z.union([
  z.object({
    unit: z.literal('days'),
    value: z.number().int().positive(),
    earlierOfNextRegularMeeting: z.object({
      boardKind: BoardKindSchema,
      noticeRuleKey: z.string().min(1),
    }),
  }),
  z.object({
    unit: z.enum(['days', 'months', 'business_days']),
    value: z.number().int().positive(),
  }),
  z.object({ unit: z.literal('stated_date') }),
  z.object({
    unit: z.literal('days'),
    cases: z.array(z.object({ when: FactConditionSchema, value: z.number().int().positive() })),
    otherwise: z.number().int().positive(),
  }),
  z.object({ unit: z.enum(['days', 'months']), fromSetting: z.string().min(1) }),
])
export type ClockLength = z.infer<typeof LengthSchema>

export const base = {
  key: z.string().min(1),
  version: z.number().int().positive(),
  label: z.string().min(1),
  citation: z.object({ label: z.string().min(1), url: z.string().url().nullable() }),
}

export const ClockRuleSchema = z
  .object({
    ...base,
    kind: z.literal('clock'),
    clockType: z.enum(['action_due', 'filing_window', 'notice_lead', 'exercise_by']),
    whose: z.enum(['official', 'board', 'applicant', 'third_party']),
    startEvent: StartEventSchema,
    length: LengthSchema,
    direction: z.enum(['after', 'before']),
    consequence: z.object({
      kind: z.enum([
        'none_stated',
        'issuance_blocked',
        'lapse',
        'selectmen_certification',
        'not_accepted_at_meeting',
        'notice_defective',
        'amendment_window_opens',
        'appeal_untimely',
        'enforcement_step_opens',
        'deemed_refused',
      ]),
      text: z.string().min(1),
    }),
    extension: z.union([
      z.object({ allowed: z.literal(false), note: z.string().min(1) }),
      z.object({
        allowed: z.literal(true),
        by: z.enum(['applicant_consent', 'town_renewal', 'board_good_cause']),
      }),
    ]),
    waivable: z.boolean(),
    onlyWhen: FactConditionSchema.optional(),
    relianceFloorMonths: z.number().int().positive().optional(),
    cancelledBy: StartEventSchema.optional(),
    satisfiedByDecision: z.boolean().optional(),
    overridePolicy: OverridePolicySchema,
  })
  .refine(
    (r) =>
      r.direction === 'after' || r.clockType === 'notice_lead' || r.clockType === 'filing_window',
    {
      message: 'before-direction requires clockType notice_lead or filing_window',
      path: ['direction'],
    },
  )
export type ClockRule = z.infer<typeof ClockRuleSchema>

export const GateRuleSchema = z.object({
  ...base,
  kind: z.literal('gate'),
  gateKind: z.literal('statutory'),
  appliesTo: z.array(CoreStateSchema).min(1),
  overridePolicy: z.object({ policy: z.literal('fixed') }),
})
export type GateRule = z.infer<typeof GateRuleSchema>

export const RecordRuleSchema = z.object({
  ...base,
  kind: z.literal('required_record'),
  fields: z.array(z.string().min(1)).min(1),
  conditionalFields: z
    .array(z.object({ field: z.string().min(1), outcomes: z.array(DecisionOutcomeSchema).min(1) }))
    .optional(),
  overridePolicy: OverridePolicySchema,
})

export type RecordRule = z.infer<typeof RecordRuleSchema>

export const EffectRuleSchema = z.object({
  ...base,
  kind: z.literal('effect'),
  effect: z.enum(['suspend_on_appeal_of_issuance', 'stay_enforcement_on_appeal']),
  overridePolicy: OverridePolicySchema,
})

export const TownSettingRuleSchema = z.object({
  ...base,
  kind: z.literal('town_setting'),
  unit: z.enum(['months', 'days']),
  overridePolicy: OverridePolicySchema,
})
export type TownSettingRule = z.infer<typeof TownSettingRuleSchema>

export const ListAgeRuleSchema = z.object({
  ...base,
  kind: z.literal('list_age'),
  maxDaysBeforeFiling: z.number().int().positive(),
  overridePolicy: z.object({ policy: z.literal('fixed') }),
})
export type ListAgeRule = z.infer<typeof ListAgeRuleSchema>

export const ProximityRuleSchema = z.object({
  ...base,
  kind: z.literal('proximity'),
  distanceFt: z.number().positive(),
  layer: z.literal('water'),
  recipientRole: z.literal('nh_des'),
  overridePolicy: z.object({ policy: z.literal('fixed') }),
})
export type ProximityRule = z.infer<typeof ProximityRuleSchema>

export const NoticeRequirementRuleSchema = z.object({
  ...base,
  kind: z.literal('notice_requirement'),
  channel: z.union([
    z.enum(NOTICE_CHANNELS),
    z.object({ townChoice: z.array(z.enum(['public_posting', 'newspaper'])).min(1) }),
  ]),
  recipients: z.union([
    z.object({ roles: z.array(AbutterRecipientRoleSchema).min(1) }),
    z.object({ public: z.literal(true) }),
  ]),
  leadRuleKey: z.string().min(1),
  onlyWhen: z.enum(['regional_impact_yes', 'des_within_500ft', 'source_water_area']).optional(),
  stage: z.enum(['before_hearing', 'on_receipt']).default('before_hearing'),
  overridePolicy: OverridePolicySchema,
})
export type NoticeRequirementRule = z.infer<typeof NoticeRequirementRuleSchema>

export const DELIVERY_RECIPIENTS = [
  'applicant',
  'agent',
  'planning_board',
  'municipal_officers',
] as const
export const DeliveryRecipientSchema = z.enum(DELIVERY_RECIPIENTS)
export type DeliveryRecipient = z.infer<typeof DeliveryRecipientSchema>

export const DELIVERY_METHODS = ['mail', 'hand'] as const
export const DeliveryMethodSchema = z.enum(DELIVERY_METHODS)
export type DeliveryMethod = z.infer<typeof DeliveryMethodSchema>

export const DecisionDeliveryRuleSchema = z.object({
  ...base,
  kind: z.literal('decision_delivery'),
  boardKinds: z.array(BoardKindSchema).min(1),
  recipients: z.array(DeliveryRecipientSchema).min(1),
  methods: z.array(DeliveryMethodSchema).min(1),
  dueRuleKey: z.string().min(1),
  overridePolicy: z.object({ policy: z.literal('fixed') }),
})
export type DecisionDeliveryRule = z.infer<typeof DecisionDeliveryRuleSchema>
