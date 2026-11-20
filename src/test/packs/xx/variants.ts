import type { PackManifest, PackRoles, StatePack } from '@/features/packs/schema'
import { XX_PACK } from './index'

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> }

export interface PackPatch {
  roles?: DeepPartial<PackRoles>
  manifest?: Partial<PackManifest>
  pack?: Partial<StatePack>
}

export function xxPackWith(patch: PackPatch): StatePack {
  const base = XX_PACK.manifest
  const roles: PackRoles = {
    classifications: { ...base.roles.classifications, ...patch.roles?.classifications },
    rules: { ...base.roles.rules, ...patch.roles?.rules },
    recordSeries: { ...base.roles.recordSeries, ...patch.roles?.recordSeries },
    ruleGroups: { ...base.roles.ruleGroups, ...patch.roles?.ruleGroups },
    gates: { ...base.roles.gates, ...patch.roles?.gates },
  }
  const manifest: PackManifest = { ...base, ...patch.manifest, roles }
  return {
    ...XX_PACK,
    ...patch.pack,
    manifest,
    classificationKeys: manifest.classifications.map((c) => c.key),
  }
}

const BUILDING_RULE_KEYS = new Set(['xx.bp.decision', 'xx.enf.order_building'])

const withoutBuilding = XX_PACK.manifest.rules.filter((r) => !BUILDING_RULE_KEYS.has(r.key))

export const XX_NO_BUILDING: StatePack = xxPackWith({
  roles: {
    classifications: { buildingPermit: null },
    rules: { buildingPermitDecision: null, buildingCodeOrder: null },
    ruleGroups: { building: [] },
  },
  manifest: {
    rules: withoutBuilding,
    classifications: XX_PACK.manifest.classifications.filter((c) => c.key !== 'xx.building_permit'),
    recordSeriesDefaults: { byClassification: {}, byApplicationType: {} },
  },
  pack: { ruleAreas: [{ title: 'All rules', rules: withoutBuilding }] },
})

export const XX_PB_SUBDIVISION_KEY = 'xx.pb_subdivision'

export const XX_OPTIONAL_HEARING: StatePack = xxPackWith({
  manifest: {
    classifications: [
      ...XX_PACK.manifest.classifications,
      {
        key: XX_PB_SUBDIVISION_KEY,
        label: 'Subdivision',
        mandatoryRuleKeys: [],
        boardKind: 'planning_board',
        abutters: null,
        noticeRequirementKeys: [],
        requiredSubsteps: [],
        directIssueAllowed: false,
        hearing: 'optional',
        appealRights: 'A decision may be appealed under Vellmora Permit Act 9.',
      },
    ],
  },
})
