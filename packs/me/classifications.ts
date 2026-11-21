import type { ProceedingClassification } from '@/features/packs/schema'

export const ME_CLASSIFICATIONS: ProceedingClassification[] = [
  {
    key: 'me.building_permit',
    label: 'Building permit',
    mandatoryRuleKeys: [
      'me.bp.decision',
      'me.bp.code_edition',
      'me.bp.code_edition_recorded',
      'town.bp.validity',
      'town.bp.expiration',
    ],
    boardKind: null,
    abutters: null,
    noticeRequirementKeys: [],
    requiredSubsteps: [],
    directIssueAllowed: true,
    hearing: 'required',
    recordingRequired: false,
    appealRights: '',
  },
]
