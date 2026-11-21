import type { PackRule, StatePack } from '@/features/packs/schema'
import { XX_PACK } from './index'
import { XX_OPTIONAL_HEARING, XX_PB_SUBDIVISION_KEY, xxPackWith } from './variants'

export const XX_COMMENCEMENT_KEY = 'xx.bp.commencement'
export const XX_HEARING_BY_KEY = 'xx.pb.hearing_by'

const PERMIT_ACT = 'https://laws.example/vellmora/permit-act'

export const XX_TRIGGER_RULES: PackRule[] = [
  {
    kind: 'clock',
    key: XX_COMMENCEMENT_KEY,
    version: 1,
    label: 'Work must commence',
    citation: { label: 'Vellmora Permit Act 11', url: PERMIT_ACT },
    clockType: 'exercise_by',
    whose: 'applicant',
    startEvent: 'permit_issued',
    length: { unit: 'months', value: 24 },
    direction: 'after',
    consequence: { kind: 'lapse', text: 'The permit lapses unless work commences.' },
    extension: { allowed: false, note: 'The act provides no extension.' },
    waivable: false,
    satisfiedByInspection: true,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'clock',
    key: XX_HEARING_BY_KEY,
    version: 1,
    label: 'Hold the elected hearing',
    citation: { label: 'Vellmora Permit Act 12', url: PERMIT_ACT },
    clockType: 'action_due',
    whose: 'board',
    startEvent: 'application_accepted',
    length: { unit: 'days', value: 30 },
    direction: 'after',
    consequence: { kind: 'none_stated', text: 'The act states no consequence.' },
    extension: { allowed: false, note: 'The act provides no extension.' },
    waivable: false,
    onlyIfHearingScheduled: true,
    overridePolicy: { policy: 'fixed' },
  },
]

const TRIGGER_PACK_RULES = [...XX_PACK.manifest.rules, ...XX_TRIGGER_RULES]

export const XX_TRIGGER_CLOCKS: StatePack = xxPackWith({
  manifest: {
    rules: TRIGGER_PACK_RULES,
    classifications: XX_OPTIONAL_HEARING.manifest.classifications.map((c) => {
      if (c.key === XX_PB_SUBDIVISION_KEY) {
        return {
          ...c,
          mandatoryRuleKeys: [...c.mandatoryRuleKeys, XX_HEARING_BY_KEY],
          noticeRequirementKeys: ['xx.zba.notice.mail'],
        }
      }
      return c.key === 'xx.board_variance'
        ? {
            ...c,
            hearing: 'optional' as const,
            requiredSubsteps: [],
            mandatoryRuleKeys: [...c.mandatoryRuleKeys, XX_HEARING_BY_KEY],
          }
        : c
    }),
  },
  pack: { ruleAreas: [{ title: 'All rules', rules: TRIGGER_PACK_RULES }] },
})
