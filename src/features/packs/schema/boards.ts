import { z } from 'zod'
import { RecipientRoleSchema } from '@/features/abutters/roles'
import { CORE_STATES } from '@/features/applications/states'

export const BOARD_KINDS = [
  'planning_board',
  'zba',
  'historic_district_commission',
  'building_code_board_of_appeals',
  'conservation_commission',
  'heritage_commission',
  'agricultural_commission',
  'housing_commission',
  'other',
] as const

export const BoardKindSchema = z.enum(BOARD_KINDS)
export type BoardKind = z.infer<typeof BoardKindSchema>

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
  key: z.string().regex(/^[a-z][a-z0-9]*\.[a-z0-9_]+$/),
  label: z.string().min(1),
  mandatoryRuleKeys: z.array(z.string().min(1)),
  boardKind: BoardKindSchema.nullable(),
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
  townBuffer: z
    .object({ defaultFt: z.number().positive().nullable(), maxFt: z.number().positive() })
    .optional(),
})
export type AbutterParams = z.infer<typeof AbutterParamsSchema>
