import type { PackRule, StatePack } from '@/features/packs/schema'
import { XX_PACK } from './index'
import { XX_RECEIPT_LEAD_KEY, XX_RECEIPT_NOTICES, XX_RECEIPT_RULES, xxPackWith } from './variants'

const CITATION = {
  label: 'Vellmora Permit Act 22',
  url: 'https://laws.example/vellmora/permit-act',
}

export const XX_APPEAL_PERIOD_SETTING_KEY = 'xx.zba.appeal_period_setting'
export const XX_APPEAL_PERIOD_KEY = 'xx.zba.appeal_period'
export const XX_RECEIPT_LEAD_SETTING_KEY = 'xx.pb.receipt_lead_setting'

const APPEAL_PERIOD_RULES: PackRule[] = [
  {
    kind: 'town_setting',
    key: XX_APPEAL_PERIOD_SETTING_KEY,
    version: 1,
    label: 'Days to appeal an administrative decision',
    citation: CITATION,
    unit: 'days',
    overridePolicy: { policy: 'delegated_choice', range: { min: 10, max: 60 }, default: 20 },
  },
  {
    kind: 'clock',
    key: XX_APPEAL_PERIOD_KEY,
    version: 1,
    label: 'Appeal of an administrative decision',
    citation: CITATION,
    clockType: 'filing_window',
    whose: 'third_party',
    startEvent: 'board_vote',
    length: { unit: 'days', fromSetting: XX_APPEAL_PERIOD_SETTING_KEY },
    direction: 'after',
    consequence: { kind: 'appeal_untimely', text: 'The appeal is late.' },
    extension: { allowed: false, note: 'The act provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'delegated_choice', range: { min: 10, max: 60 }, default: 20 },
  },
]

const APPEAL_PACK_RULES = [...XX_PACK.manifest.rules, ...APPEAL_PERIOD_RULES]

export const XX_TOWN_SET_APPEAL_WINDOW: StatePack = xxPackWith({
  roles: { rules: { adminAppealToZba: XX_APPEAL_PERIOD_KEY } },
  manifest: { rules: APPEAL_PACK_RULES },
  pack: {
    ruleAreas: [{ title: 'All rules', rules: APPEAL_PACK_RULES }],
    appealRoutes: [
      {
        from: 'administrative_decision',
        to: 'zba_appeal',
        windowRuleKey: XX_APPEAL_PERIOD_KEY,
        citation: CITATION,
      },
    ],
  },
})

const RECEIPT_LEAD_SETTING: PackRule = {
  kind: 'town_setting',
  key: XX_RECEIPT_LEAD_SETTING_KEY,
  version: 1,
  label: 'Days to mail receipt notices',
  citation: CITATION,
  unit: 'days',
  overridePolicy: { policy: 'delegated_choice', range: { min: 1, max: 30 }, default: 5 },
}

const TOWN_SET_RECEIPT_RULES: PackRule[] = [
  ...XX_PACK.manifest.rules,
  RECEIPT_LEAD_SETTING,
  ...XX_RECEIPT_RULES.map((rule) =>
    rule.key === XX_RECEIPT_LEAD_KEY && rule.kind === 'clock'
      ? {
          ...rule,
          length: { unit: 'days' as const, fromSetting: XX_RECEIPT_LEAD_SETTING_KEY },
          overridePolicy: RECEIPT_LEAD_SETTING.overridePolicy,
        }
      : rule,
  ),
]

export const XX_TOWN_SET_RECEIPT_LEAD: StatePack = xxPackWith({
  manifest: {
    rules: TOWN_SET_RECEIPT_RULES,
    classifications: XX_RECEIPT_NOTICES.manifest.classifications,
  },
  pack: { ruleAreas: [{ title: 'All rules', rules: TOWN_SET_RECEIPT_RULES }] },
})
