import { RSA_676_5, RSA_677_2, RSA_677_4, RSA_677_15 } from '@packs/nh/rules/boardUrls'

export const APPEAL_NODE_KINDS = [
  'administrative_decision',
  'zba_decision',
  'pb_decision',
  'zba_appeal',
  'rehearing_motion',
  'rehearing_outcome',
  'court_petition',
] as const
export type AppealNodeKind = (typeof APPEAL_NODE_KINDS)[number]

export interface AppealRoute {
  from: AppealNodeKind
  when?: string
  to: AppealNodeKind
  windowRuleKey: string | null
  citation: { label: string; url: string }
}

export const NH_APPEAL_ROUTES: AppealRoute[] = [
  {
    from: 'administrative_decision',
    to: 'zba_appeal',
    windowRuleKey: 'nh.appeal.admin_to_zba',
    citation: { label: 'RSA 676:5 I', url: RSA_676_5 },
  },
  {
    from: 'zba_decision',
    to: 'rehearing_motion',
    windowRuleKey: 'nh.appeal.zba_rehearing',
    citation: { label: 'RSA 677:2', url: RSA_677_2 },
  },
  {
    from: 'rehearing_motion',
    to: 'rehearing_outcome',
    windowRuleKey: null,
    citation: { label: 'RSA 677:2', url: RSA_677_2 },
  },
  {
    from: 'rehearing_outcome',
    when: 'denied',
    to: 'court_petition',
    windowRuleKey: 'nh.appeal.zba_court',
    citation: { label: 'RSA 677:4', url: RSA_677_4 },
  },
  {
    from: 'rehearing_outcome',
    when: 'granted',
    to: 'zba_decision',
    windowRuleKey: null,
    citation: { label: 'RSA 677:2', url: RSA_677_2 },
  },
  {
    from: 'pb_decision',
    to: 'court_petition',
    windowRuleKey: 'nh.appeal.pb_court',
    citation: { label: 'RSA 677:15 I', url: RSA_677_15 },
  },
  {
    from: 'pb_decision',
    when: 'zoning matters appealable under RSA 676:5 III',
    to: 'zba_appeal',
    windowRuleKey: 'nh.appeal.admin_to_zba',
    citation: { label: 'RSA 677:15 I-a', url: RSA_677_15 },
  },
  {
    from: 'rehearing_outcome',
    when: 'denied on a linked component',
    to: 'court_petition',
    windowRuleKey: 'nh.appeal.pb_court_after_zba',
    citation: { label: 'RSA 677:15 I-a', url: RSA_677_15 },
  },
]
