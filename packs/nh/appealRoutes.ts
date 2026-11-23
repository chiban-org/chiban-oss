import { RSA_676_5, RSA_677_2, RSA_677_4, RSA_677_15 } from '@packs/nh/rules/boardUrls'
import type { AppealRoute } from '@/features/packs/schema'

export const NH_APPEAL_ROUTES: AppealRoute[] = [
  {
    from: 'administrative_decision',
    to: 'zba_appeal',
    windowRuleKey: 'nh.appeal.admin_to_zba',
    citation: { label: 'RSA 676:5 I', url: RSA_676_5 },
  },
  {
    from: 'zba_appeal',
    to: 'zba_decision',
    windowRuleKey: null,
    citation: { label: 'RSA 676:5', url: RSA_676_5 },
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
    when: { outcome: 'denied', label: 'denied' },
    to: 'court_petition',
    windowRuleKey: 'nh.appeal.zba_court',
    citation: { label: 'RSA 677:4', url: RSA_677_4 },
  },
  {
    from: 'rehearing_outcome',
    when: { outcome: 'granted', label: 'granted' },
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
    when: { linkedComponent: true, label: 'zoning matters appealable under RSA 676:5 III' },
    to: 'zba_appeal',
    windowRuleKey: 'nh.appeal.admin_to_zba',
    citation: { label: 'RSA 677:15 I-a', url: RSA_677_15 },
  },
  {
    from: 'rehearing_outcome',
    when: { outcome: 'denied', linkedComponent: true, label: 'denied on a linked component' },
    to: 'court_petition',
    windowRuleKey: 'nh.appeal.pb_court_after_zba',
    citation: { label: 'RSA 677:15 I-a', url: RSA_677_15 },
  },
]
