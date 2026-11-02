import { RSA_676_5, RSA_677_2, RSA_677_4, RSA_677_15 } from '@packs/nh/rules/boardUrls'
import type { ClockRule, PackRule } from '@packs/nh/schema'

type WindowOptions = Pick<ClockRule, 'key' | 'label' | 'startEvent'> &
  Partial<Pick<ClockRule, 'onlyWhen'>> & {
    citation: ClockRule['citation']
    consequenceText: string
    consequenceKind?: ClockRule['consequence']['kind']
  }

function appealWindow(options: WindowOptions): ClockRule {
  return {
    kind: 'clock',
    key: options.key,
    version: 1,
    label: options.label,
    citation: options.citation,
    clockType: 'filing_window',
    whose: 'third_party',
    startEvent: options.startEvent,
    length: { unit: 'days', value: 30 },
    direction: 'after',
    ...(options.onlyWhen === undefined ? {} : { onlyWhen: options.onlyWhen }),
    consequence: {
      kind: options.consequenceKind ?? 'appeal_untimely',
      text: options.consequenceText,
    },
    extension: { allowed: false, note: `${options.citation.label} provides no extension.` },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  }
}

const UNTIMELY = (label: string) => `An appeal filed after this date is untimely (${label}).`

export const APPEAL_RULES: PackRule[] = [
  {
    kind: 'effect',
    key: 'nh.appeal.suspension',
    version: 1,
    label: 'Suspended by appeal (RSA 676:6)',
    citation: {
      label: 'RSA 676:6',
      url: 'https://gc.nh.gov/rsa/html/LXIV/676/676-6.htm',
    },
    effect: 'suspend_on_appeal_of_issuance',
    overridePolicy: { policy: 'fixed' },
  },
  appealWindow({
    key: 'nh.appeal.admin_to_zba',
    label: 'Appeal of an administrative decision to the ZBA',
    startEvent: 'administrative_decision',
    citation: { label: 'RSA 676:5 I', url: RSA_676_5 },
    consequenceText: UNTIMELY('RSA 676:5 I'),
  }),
  appealWindow({
    key: 'nh.appeal.zba_rehearing',
    label: 'Motion for rehearing of a ZBA decision',
    startEvent: 'board_vote',
    onlyWhen: { fact: 'outcome', in: ['approved', 'approved_with_conditions', 'denied'] },
    citation: { label: 'RSA 677:2', url: RSA_677_2 },
    consequenceText: UNTIMELY('RSA 677:2'),
  }),
  appealWindow({
    key: 'nh.appeal.zba_court',
    label: 'Court appeal after a denied ZBA rehearing',
    startEvent: 'rehearing_vote',
    onlyWhen: { fact: 'outcome', in: ['rehearing_denied'] },
    citation: { label: 'RSA 677:4', url: RSA_677_4 },
    consequenceText: UNTIMELY('RSA 677:4'),
  }),
  appealWindow({
    key: 'nh.appeal.pb_court',
    label: 'Court appeal of a Planning Board decision',
    startEvent: 'board_vote',
    citation: { label: 'RSA 677:15 I', url: RSA_677_15 },
    consequenceText: UNTIMELY('RSA 677:15 I'),
  }),
  appealWindow({
    key: 'nh.appeal.pb_court_after_zba',
    label: 'Court appeal of a Planning Board decision after the ZBA component',
    startEvent: 'rehearing_vote',
    citation: { label: 'RSA 677:15 I-a', url: RSA_677_15 },
    consequenceText: UNTIMELY('RSA 677:15 I-a'),
  }),
  appealWindow({
    key: 'nh.appeal.amendment_window',
    label: 'Amendment window after a late filing',
    startEvent: 'decision_filed',
    onlyWhen: { fact: 'decisionFiledLate', is: true },
    citation: { label: 'RSA 677:2, 677:4, 677:15 I', url: RSA_677_2 },
    consequenceText:
      'An amended rehearing motion or court petition filed after this date is untimely (RSA 677:2, 677:4, 677:15 I).',
  }),
]
