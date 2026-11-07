import {
  AbutterParamsSchema,
  type BoardKind,
  BoardKindSchema,
  ProceedingClassificationSchema,
} from '@packs/nh/boardSchema'
import { z } from 'zod'
import { RecipientRoleSchema as AbutterRecipientRoleSchema } from '@/features/abutters/roles'
import { CORE_STATES } from '@/features/applications/states'
import { NOTICE_CHANNELS } from '@/features/notices/channels'
import { type CivilDate, parseCivilDate } from '@/types/civilDate'

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
    earlierOfNextRegularMeeting: z.object({ boardKind: BoardKindSchema, noticeRuleKey: z.string().min(1) }),
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

const base = {
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
  onlyWhen: z.enum(['regional_impact_yes', 'des_within_500ft']).optional(),
  overridePolicy: OverridePolicySchema,
})
export type NoticeRequirementRule = z.infer<typeof NoticeRequirementRuleSchema>
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

export const CivilPenaltyRuleSchema = z.object({
  ...base,
  kind: z.literal('civil_penalty'),
  firstOffenseCentsPerDay: z.number().int().positive(),
  subsequentCentsPerDay: z.number().int().positive(),
  accrual: z.literal('after_earlier_of_conviction_or_written_notice'),
  imposedBy: z.literal('court'),
  overridePolicy: z.object({ policy: z.literal('fixed') }),
})
export type CivilPenaltyRule = z.infer<typeof CivilPenaltyRuleSchema>

export const PackRuleSchema = z
  .union([
    ClockRuleSchema,
    GateRuleSchema,
    ListAgeRuleSchema,
    ProximityRuleSchema,
    RecordRuleSchema,
    EffectRuleSchema,
    TownSettingRuleSchema,
    NoticeRequirementRuleSchema,
    CeaseAndDesistRuleSchema,
    CivilPenaltyRuleSchema,
  ])
  .refine(
    (r) =>
      r.key.startsWith('town.')
        ? r.citation.label === 'Town rule' && r.citation.url === null
        : r.citation.url !== null,
    {
      message: 'town rules cite "Town rule" with no url; all others need a url',
      path: ['citation'],
    },
  )
export type PackRule = z.infer<typeof PackRuleSchema>

export const CodeEditionEntrySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(['verified', 'unverified']),
  effectiveFrom: civilDateSchema,
  enforcementFrom: civilDateSchema.nullable(),
  components: z.array(z.object({ code: z.string().min(1), edition: z.string().min(1) })),
  amendmentPackages: z.array(
    z.object({ effectiveFrom: civilDateSchema, label: z.string().min(1) }),
  ),
  electionWindow: z
    .object({ until: civilDateSchema, mayElect: z.array(z.string().min(1)).min(1) })
    .nullable(),
  citation: z.object({ label: z.string().min(1), url: z.string().url() }),
})
export type CodeEditionEntry = z.infer<typeof CodeEditionEntrySchema>

export const RecordEventKindSchema = z.enum([
  'application_withdrawn',
  'application_denied',
  'building_removed',
  'registration_expired',
  'septic_replaced_or_removed',
  'appeal_period_expired',
])
export type RecordEventKind = z.infer<typeof RecordEventKindSchema>

export const RetentionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('permanent') }),
  z.object({ kind: z.literal('duration'), years: z.number().int().positive() }),
  z.object({
    kind: z.literal('event'),
    events: z.array(RecordEventKindSchema).min(1),
    plusYears: z.number().int().min(0),
  }),
])
export type Retention = z.infer<typeof RetentionSchema>

export const RecordSeriesSchema = z.object({
  key: z.string().min(1),
  version: z.number().int().positive(),
  label: z.string().min(1),
  citation: z.object({ label: z.string().min(1), url: z.string().url() }),
  retention: RetentionSchema,
  preservation: z.enum(['pdfa', 'original']),
  outcomes: z
    .object({
      withdrawn: z.string().min(1).optional(),
      denied: z.string().min(1).optional(),
      expired: z.string().min(1).optional(),
    })
    .optional(),
})
export type RecordSeries = z.infer<typeof RecordSeriesSchema>

export const PackManifestSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    rules: z.array(PackRuleSchema).min(1),
    classifications: z.array(ProceedingClassificationSchema).min(1),
    codeEditions: z.array(CodeEditionEntrySchema).min(1),
    recordSeries: z.array(RecordSeriesSchema).min(1),
    recordSeriesDefaults: z.object({
      byClassification: z.record(z.string(), z.string()),
      byApplicationType: z.record(z.string(), z.string()),
    }),
    abutterParams: z.array(AbutterParamsSchema).min(1),
  })
  .superRefine((m, ctx) => {
    const keys = new Set(m.rules.map((r) => r.key))
    const seen = new Set<string>()
    for (const r of m.rules) {
      const id = `${r.key}@${r.version}`
      if (seen.has(id)) ctx.addIssue({ code: 'custom', message: `duplicate rule ${id}` })
      seen.add(id)
    }
    for (const c of m.classifications) {
      for (const k of c.mandatoryRuleKeys) {
        if (!keys.has(k)) ctx.addIssue({ code: 'custom', message: `unknown mandatory rule ${k}` })
      }
      for (const k of c.noticeRequirementKeys) {
        if (!keys.has(k)) ctx.addIssue({ code: 'custom', message: `unknown notice rule ${k}` })
      }
    }
  })
export type PackManifestData = z.infer<typeof PackManifestSchema>

export * from '@packs/nh/boardSchema'
