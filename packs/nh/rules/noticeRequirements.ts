import { RSA_36_57_URL, RSA_676_4, RSA_676_7 } from '@packs/nh/rules/boardUrls'
import type { NoticeRequirementRule, PackRule } from '@packs/nh/schema'
import type { RecipientRole } from '@/features/abutters/roles'

const ZBA_ROLES: RecipientRole[] = [
  'applicant',
  'abutter_owner',
  'condo_association_officer',
  'mhp_owner',
  'mhp_tenant',
  'restriction_holder',
]
const PB_ROLES: RecipientRole[] = [...ZBA_ROLES, 'sealed_professional']

function requirement(
  fields: Pick<NoticeRequirementRule, 'key' | 'label' | 'channel' | 'recipients' | 'leadRuleKey'> &
    Partial<Pick<NoticeRequirementRule, 'onlyWhen' | 'overridePolicy'>> & {
      citation: NoticeRequirementRule['citation']
    },
): NoticeRequirementRule {
  return {
    kind: 'notice_requirement',
    version: 1,
    overridePolicy: { policy: 'fixed' },
    ...fields,
  }
}

export const NOTICE_REQUIREMENT_RULES: PackRule[] = [
  requirement({
    key: 'nh.pb.notice_req.mail',
    label: 'Planning Board mailed notice to the parties',
    channel: 'verified_mail',
    recipients: { roles: PB_ROLES },
    leadRuleKey: 'nh.pb.notice.mail',
    citation: { label: 'RSA 676:4 I(d)(1)', url: RSA_676_4 },
  }),
  requirement({
    key: 'nh.pb.notice_req.des',
    label: 'Planning Board notice to NH DES',
    channel: 'first_class_mail',
    recipients: { roles: ['nh_des'] },
    leadRuleKey: 'nh.pb.notice.mail',
    onlyWhen: 'des_within_500ft',
    citation: { label: 'RSA 676:4 I(d)(2)', url: RSA_676_4 },
  }),
  requirement({
    key: 'nh.pb.notice_req.public',
    label: 'Planning Board public notice',
    channel: { townChoice: ['public_posting', 'newspaper'] },
    recipients: { public: true },
    leadRuleKey: 'nh.pb.notice.mail',
    overridePolicy: { policy: 'delegated_choice', default: 0 },
    citation: { label: 'RSA 676:4 I(d)(1)', url: RSA_676_4 },
  }),
  requirement({
    key: 'nh.zba.notice_req.mail',
    label: 'ZBA mailed notice to the parties',
    channel: 'verified_mail',
    recipients: { roles: ZBA_ROLES },
    leadRuleKey: 'nh.zba.notice.mail',
    citation: { label: 'RSA 676:7 I(a)', url: RSA_676_7 },
  }),
  requirement({
    key: 'nh.zba.notice_req.newspaper',
    label: 'ZBA published notice',
    channel: 'newspaper',
    recipients: { public: true },
    leadRuleKey: 'nh.zba.notice.newspaper',
    citation: { label: 'RSA 676:7 I(b)', url: RSA_676_7 },
  }),
  requirement({
    key: 'nh.ri.notice_req.certified',
    label: 'Regional impact certified notice',
    channel: 'certified_mail',
    recipients: { roles: ['regional_planning_commission', 'affected_municipality'] },
    leadRuleKey: 'nh.ri.notice.certified',
    onlyWhen: 'regional_impact_yes',
    citation: { label: 'RSA 36:57 III', url: RSA_36_57_URL },
  }),
]
