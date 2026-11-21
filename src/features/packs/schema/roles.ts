import { z } from 'zod'

const key = z.string().min(1)
const absentOr = key.nullable()

export const ClassificationRolesSchema = z.object({
  buildingPermit: absentOr,
  tradePermit: absentOr,
  enforcement: z.array(key),
  plumbingInspectorOwns: z.array(key),
})

export const RuleRolesSchema = z.object({
  buildingPermitDecision: absentOr,
  zoningOrder: key,
  buildingCodeOrder: absentOr,
  rtkResponse: key,
  rtkStatedTime: key,
  planningBoardDecision: absentOr,
  zbaDecision: absentOr,
  planningBoardCompleteness: absentOr,
  zbaHearing: absentOr,
  writtenDecision: absentOr,
  decisionFiling: absentOr,
  appealSuspension: absentOr,
  adminAppealToZba: absentOr,
  codeEditionRecord: absentOr,
  codeEditionGate: absentOr,
  regionalImpactGate: absentOr,
  regionalImpactComment: absentOr,
  regionalImpactDetermination: absentOr,
  regionalImpactTransmittal: absentOr,
  abutterListAge: absentOr,
  filingLead: absentOr,
  desProximity: absentOr,
  zbaExercise: absentOr,
})

export const RecordSeriesRolesSchema = z.object({
  rtkCorrespondence: key,
  complaintLog: key,
  codeEnforcementFiles: key,
  publicParcelFiles: z.array(key),
})

export const RuleGroupRolesSchema = z.object({
  building: z.array(key),
  board: z.array(key),
  portalBoardDeadlines: z.array(key),
})

export const GateRolesSchema = z.object({
  abutterListFresh: absentOr,
  varianceRecorded: absentOr,
})

export const PackRolesSchema = z.object({
  classifications: ClassificationRolesSchema,
  rules: RuleRolesSchema,
  recordSeries: RecordSeriesRolesSchema,
  ruleGroups: RuleGroupRolesSchema,
  gates: GateRolesSchema,
})
export type PackRoles = z.infer<typeof PackRolesSchema>
export type RuleRole = keyof PackRoles['rules']
