import { z } from 'zod'
import {
  type AbutterParams,
  AbutterParamsSchema,
  type ProceedingClassification,
  ProceedingClassificationSchema,
} from './boards'
import { CeaseAndDesistRuleSchema, CivilPenaltyRuleSchema } from './enforcement'
import {
  type CodeEditionEntry,
  CodeEditionEntrySchema,
  type RecordSeries,
  RecordSeriesSchema,
} from './records'
import { roleIssues } from './roleChecks'
import { type PackRoles, PackRolesSchema } from './roles'
import {
  ClockRuleSchema,
  DecisionDeliveryRuleSchema,
  EffectRuleSchema,
  GateRuleSchema,
  ListAgeRuleSchema,
  NoticeRequirementRuleSchema,
  ProximityRuleSchema,
  RecordRuleSchema,
  TownSettingRuleSchema,
} from './rules'

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
    DecisionDeliveryRuleSchema,
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

function deliveryIssues(rules: PackRule[]): string[] {
  const clockByKey = new Map(
    rules.flatMap((r) => (r.kind === 'clock' ? [[r.key, r] as const] : [])),
  )
  return rules.flatMap((r) => {
    if (r.kind !== 'decision_delivery') return []
    const due = clockByKey.get(r.dueRuleKey)
    const valid = due?.clockType === 'action_due' && due.startEvent === 'board_vote'
    return valid
      ? []
      : [
          `decision_delivery ${r.key} dueRuleKey ${r.dueRuleKey} must be an action_due clock started by board_vote`,
        ]
  })
}

function receiptStageIssues(rules: PackRule[]): string[] {
  const clockByKey = new Map(
    rules.flatMap((r) => (r.kind === 'clock' ? [[r.key, r] as const] : [])),
  )
  return rules.flatMap((r) => {
    if (r.kind !== 'notice_requirement' || r.stage !== 'on_receipt') return []
    const lead = clockByKey.get(r.leadRuleKey)
    const valid = lead?.direction === 'after' && lead.startEvent === 'application_received'
    return valid
      ? []
      : [
          `notice_requirement ${r.key} is on_receipt and its lead clock ${r.leadRuleKey} must count after application_received`,
        ]
  })
}

function settingClockIssues(rules: PackRule[]): string[] {
  const kindByKey = new Map(rules.map((r) => [r.key, r.kind]))
  const issues: string[] = []
  for (const r of rules) {
    if (r.kind !== 'clock') continue
    if (r.consequence.kind === 'deemed_refused' && r.clockType !== 'action_due') {
      issues.push(`clock ${r.key} is deemed_refused and must be an action_due clock`)
    }
    if (!('fromSetting' in r.length)) {
      if (r.overridePolicy.policy === 'delegated_choice') {
        issues.push(
          `clock ${r.key} uses delegated_choice; read a town_setting through length.fromSetting`,
        )
      }
    } else if (kindByKey.get(r.length.fromSetting) !== 'town_setting') {
      issues.push(`clock ${r.key} fromSetting ${r.length.fromSetting} is not a town_setting`)
    }
  }
  return issues
}

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
    roles: PackRolesSchema,
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
    const targets = {
      ruleKeys: keys,
      classificationKeys: new Set(m.classifications.map((c) => c.key)),
      seriesKeys: new Set(m.recordSeries.map((r) => r.key)),
    }
    const issues = [
      ...roleIssues(m.roles, targets),
      ...settingClockIssues(m.rules),
      ...deliveryIssues(m.rules),
      ...receiptStageIssues(m.rules),
    ]
    for (const message of issues) ctx.addIssue({ code: 'custom', message })
  })
export type PackManifestData = z.infer<typeof PackManifestSchema>

export interface PackManifest {
  id: string
  version: string
  rules: PackRule[]
  classifications: ProceedingClassification[]
  codeEditions: CodeEditionEntry[]
  recordSeries: RecordSeries[]
  recordSeriesDefaults: {
    byClassification: Record<string, string>
    byApplicationType: Record<string, string>
  }
  abutterParams: AbutterParams[]
  roles: PackRoles
}
