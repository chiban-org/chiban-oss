import { z } from 'zod'
import { RecipientRoleSchema } from '@/features/abutters/roles'
import { CORE_STATES } from '@/features/applications/states'

export const BoardSchema = z.enum(['planning_board', 'zba'])
export type Board = z.infer<typeof BoardSchema>

export const CLASSIFICATION_KEYS = [
  'nh.building_permit',
  'nh.trade_permit',
  'nh.pb_site_plan',
  'nh.pb_subdivision',
  'nh.pb_conditional_use',
  'nh.pb_design_review',
  'nh.zba_variance',
  'nh.zba_special_exception',
  'nh.zba_administrative_appeal',
  'nh.zba_equitable_waiver',
  'nh.zba_rehearing_motion',
  'nh.enforcement_zoning',
  'nh.enforcement_building_code',
  'nh.local_zoning_permit',
  'nh.local_permit_other',
] as const

export const AbuttersSpecSchema = z.object({
  strategyKey: z.string().min(1),
  resolverKey: z.string().min(1),
  roles: z.array(RecipientRoleSchema).min(1),
  conditionalRoles: z.array(
    z.object({
      role: RecipientRoleSchema,
      when: z.enum(['regional_impact_yes', 'des_within_500ft']),
    }),
  ),
})

export const ProceedingClassificationSchema = z.object({
  key: z.enum(CLASSIFICATION_KEYS),
  label: z.string().min(1),
  mandatoryRuleKeys: z.array(z.string().min(1)),
  board: BoardSchema.nullable(),
  abutters: AbuttersSpecSchema.nullable(),
  noticeRequirementKeys: z.array(z.string().min(1)),
  requiredSubsteps: z.array(z.object({ state: z.enum(CORE_STATES), key: z.string().min(1) })),
  directIssueAllowed: z.boolean(),
  appealRights: z.string(),
})
export type ProceedingClassification = z.infer<typeof ProceedingClassificationSchema>

export const AbutterParamsSchema = z.object({
  key: z.string().min(1),
  version: z.number().int().positive(),
  citation: z.object({ label: z.string().min(1), url: z.string().url() }),
  captureRadiusFt: z.number().positive(),
  adjacencyToleranceFt: z.number().positive(),
  simplifyToleranceFt: z.number().positive(),
  cornerTurnDeg: z.number().positive(),
  areaFrontageToleranceFt: z.number().positive(),
  parallelToleranceDeg: z.number().positive(),
  onFeatureToleranceFt: z.number().positive(),
  maxCrossingFt: z.number().positive(),
  alongDepthFt: z.number().positive(),
  tolerancesLabel: z.string().min(1),
})
export type AbutterParams = z.infer<typeof AbutterParamsSchema>
