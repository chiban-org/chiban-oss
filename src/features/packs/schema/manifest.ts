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
import {
  ClockRuleSchema,
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
}
