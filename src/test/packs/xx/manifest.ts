import type { PackManifest } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'
import { XX_ENFORCEMENT_RULES } from './enforcementRules'
import { XX_ROLES } from './roles'
import { XX_RULES } from './rules'

const PERMIT_ACT = 'https://laws.example/vellmora/permit-act'

export const XX_PACK_MANIFEST: PackManifest = {
  id: 'xx',
  version: '0.1.0',
  rules: [...XX_RULES, ...XX_ENFORCEMENT_RULES],
  classifications: [
    {
      key: 'xx.building_permit',
      label: 'Building permit',
      mandatoryRuleKeys: ['xx.bp.decision'],
      boardKind: null,
      abutters: null,
      noticeRequirementKeys: [],
      requiredSubsteps: [],
      directIssueAllowed: false,
      hearing: 'required',
      recordingRequired: false,
      appealRights: 'A decision may be appealed under Vellmora Permit Act 9.',
    },
    {
      key: 'xx.trade_permit',
      label: 'Trade permit',
      mandatoryRuleKeys: [],
      boardKind: null,
      abutters: null,
      noticeRequirementKeys: [],
      requiredSubsteps: [],
      directIssueAllowed: true,
      hearing: 'required',
      recordingRequired: false,
      appealRights: 'A decision may be appealed under Vellmora Permit Act 9.',
    },
    {
      key: 'xx.board_variance',
      label: 'Variance',
      mandatoryRuleKeys: ['xx.zba.hearing', 'xx.zba.notice_lead'],
      boardKind: 'zba',
      abutters: {
        strategyKey: 'nh.abutters.adjacency_projection',
        resolverKey: 'nh.recipients.v1',
        roles: ['applicant', 'abutter_owner'],
        conditionalRoles: [],
      },
      noticeRequirementKeys: ['xx.zba.notice.mail'],
      requiredSubsteps: [{ state: 'under_review', key: 'hearing' }],
      directIssueAllowed: false,
      hearing: 'required',
      recordingRequired: false,
      appealRights: 'A decision may be appealed under Vellmora Permit Act 9.',
    },
  ],
  codeEditions: [
    {
      key: 'xx.edition.base',
      label: 'Vellmora building code, first edition',
      status: 'verified',
      effectiveFrom: '2000-01-01' as CivilDate,
      enforcementFrom: null,
      components: [{ code: 'IBC', edition: '2021' }],
      amendmentPackages: [],
      electionWindow: null,
      citation: { label: 'Vellmora Permit Act 2', url: PERMIT_ACT },
    },
  ],
  recordSeries: [
    {
      key: 'xx.rs.permits',
      version: 1,
      label: 'Permits',
      citation: {
        label: 'Vellmora Records Act 1',
        url: 'https://laws.example/vellmora/records-act',
      },
      retention: { kind: 'permanent' },
      preservation: 'pdfa',
    },
    {
      key: 'xx.rs.correspondence',
      version: 1,
      label: 'Correspondence and enforcement files',
      citation: {
        label: 'Vellmora Records Act 1',
        url: 'https://laws.example/vellmora/records-act',
      },
      retention: { kind: 'duration', years: 5 },
      preservation: 'original',
    },
  ],
  recordSeriesDefaults: {
    byClassification: { 'xx.building_permit': 'xx.rs.permits' },
    byApplicationType: {},
  },
  abutterParams: [
    {
      key: 'xx.abutters.adjacent',
      version: 1,
      citation: { label: 'Vellmora Permit Act 6', url: PERMIT_ACT },
      captureRadiusFt: 25,
      adjacencyToleranceFt: 1,
      simplifyToleranceFt: 2,
      cornerTurnDeg: 30,
      areaFrontageToleranceFt: 5,
      parallelToleranceDeg: 45,
      onFeatureToleranceFt: 0.5,
      maxCrossingFt: 200,
      alongDepthFt: 5,
      tolerancesLabel: 'Fictional tolerances for tests.',
    },
  ],
  roles: XX_ROLES,
}
