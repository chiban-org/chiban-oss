import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { NH_CODE_EDITIONS } from '@packs/nh/codeEditions'
import { APPEAL_RULES } from '@packs/nh/rules/appeals'
import { BUILDING_RULES } from '@packs/nh/rules/building'
import { CODE_RULES } from '@packs/nh/rules/code'
import type { CodeEditionEntry, PackRule, ProceedingClassification } from '@packs/nh/schema'

export interface PackManifest {
  id: string
  version: string
  rules: PackRule[]
  classifications: ProceedingClassification[]
  codeEditions: CodeEditionEntry[]
}

export const NH_PACK_MANIFEST: PackManifest = {
  id: 'nh',
  version: '0.2.0',
  rules: [...BUILDING_RULES, ...APPEAL_RULES, ...CODE_RULES],
  classifications: NH_CLASSIFICATIONS,
  codeEditions: NH_CODE_EDITIONS,
}
