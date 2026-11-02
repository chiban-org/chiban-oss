import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { NH_CODE_EDITIONS } from '@packs/nh/codeEditions'
import { NH_RECORD_SERIES, RECORD_SERIES_DEFAULTS } from '@packs/nh/recordSeries'
import { APPEAL_RULES } from '@packs/nh/rules/appeals'
import { BUILDING_RULES } from '@packs/nh/rules/building'
import { CODE_RULES } from '@packs/nh/rules/code'
import { ENFORCEMENT_RULES } from '@packs/nh/rules/enforcement'
import { LOCAL_PERMIT_RULES } from '@packs/nh/rules/localPermits'
import { RTK_RULES } from '@packs/nh/rules/rightToKnow'
import type {
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
  recordSeriesDefaults: {
    byClassification: Record<string, string>
    byApplicationType: Record<string, string>
  }
}

export const NH_PACK_MANIFEST: PackManifest = {
  id: 'nh',
  version: '0.4.0',
  rules: [
    ...BUILDING_RULES,
    ...APPEAL_RULES,
    ...CODE_RULES,
    ...LOCAL_PERMIT_RULES,
    ...ENFORCEMENT_RULES,
    ...RTK_RULES,
  ],
  classifications: NH_CLASSIFICATIONS,
  codeEditions: NH_CODE_EDITIONS,
  recordSeries: NH_RECORD_SERIES,
  recordSeriesDefaults: RECORD_SERIES_DEFAULTS,
}
