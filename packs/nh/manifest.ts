import { NH_ABUTTER_PARAMS } from '@packs/nh/abutters/params'
import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { NH_CODE_EDITIONS } from '@packs/nh/codeEditions'
import { NH_RECORD_SERIES, RECORD_SERIES_DEFAULTS } from '@packs/nh/recordSeries'
import { APPEAL_RULES } from '@packs/nh/rules/appeals'
import { BUILDING_RULES } from '@packs/nh/rules/building'
import { CODE_RULES } from '@packs/nh/rules/code'
import { PLANNING_BOARD_RULES } from '@packs/nh/rules/planningBoard'
import { REGIONAL_IMPACT_BOARD_RULES } from '@packs/nh/rules/regionalImpact'
import { ZBA_RULES } from '@packs/nh/rules/zba'
import type {
  AbutterParams,
  CodeEditionEntry,
  PackRule,
  ProceedingClassification,
  RecordSeries,
} from '@packs/nh/schema'

export interface PackManifest {
  id: string
  version: string
  rules: PackRule[]
  classifications: ProceedingClassification[]
  codeEditions: CodeEditionEntry[]
  recordSeries: RecordSeries[]
  recordSeriesDefaults: { byClassification: Record<string, string> }
  abutterParams: AbutterParams[]
}

export const NH_PACK_MANIFEST: PackManifest = {
  id: 'nh',
  version: '0.3.0',
  rules: [
    ...BUILDING_RULES,
    ...APPEAL_RULES,
    ...CODE_RULES,
    ...PLANNING_BOARD_RULES,
    ...ZBA_RULES,
    ...REGIONAL_IMPACT_BOARD_RULES,
  ],
  classifications: NH_CLASSIFICATIONS,
  codeEditions: NH_CODE_EDITIONS,
  recordSeries: NH_RECORD_SERIES,
  recordSeriesDefaults: RECORD_SERIES_DEFAULTS,
  abutterParams: [NH_ABUTTER_PARAMS],
}
