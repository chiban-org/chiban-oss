import { describe, expect, it } from 'vitest'
import { planRequirement } from '@/features/notices/requirementPlan'
import { loadPack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const NO_FLAGS = { regionalImpact: false, desWithin: false }

function requirement(key: string) {
  const rule = loadPack().rules.find((r) => r.key === key)
  if (rule === undefined || rule.kind !== 'notice_requirement') throw new Error(key)
  return rule
}

function plan(
  key: string,
  hearingDate: string,
  extra: Partial<Parameters<typeof planRequirement>[1]> = {},
) {
  return planRequirement(requirement(key), {
    hearingDate: d(hearingDate),
    flags: NO_FLAGS,
    townLeadDays: {},
    publicChoice: null,
    ...extra,
  })
}

describe('planRequirement', () => {
  it('pb hearing on 2027-04-14 plans verified mail due 2027-04-04', () => {
    expect(plan('nh.pb.notice_req.mail', '2027-04-14')).toMatchObject({
      channel: 'verified_mail',
      dueOn: '2027-04-04',
    })
  })

  it('zba hearing on 2027-04-15 plans mail and newspaper due 2027-04-10', () => {
    expect(plan('nh.zba.notice_req.mail', '2027-04-15')?.dueOn).toBe('2027-04-10')
    expect(plan('nh.zba.notice_req.newspaper', '2027-04-15')).toMatchObject({
      channel: 'newspaper',
      dueOn: '2027-04-10',
      recipients: { public: true },
    })
  })

  it('regional impact adds certified items due 2027-03-31 for a hearing on 2027-04-14', () => {
    expect(plan('nh.ri.notice_req.certified', '2027-04-14')).toBeNull()
    expect(
      plan('nh.ri.notice_req.certified', '2027-04-14', {
        flags: { regionalImpact: true, desWithin: false },
      }),
    ).toMatchObject({ channel: 'certified_mail', dueOn: '2027-03-31' })
  })

  it('des within 500 feet adds a first class item with the abutter due date', () => {
    expect(plan('nh.pb.notice_req.des', '2027-04-14')).toBeNull()
    expect(
      plan('nh.pb.notice_req.des', '2027-04-14', {
        flags: { regionalImpact: false, desWithin: true },
      }),
    ).toMatchObject({ channel: 'first_class_mail', dueOn: '2027-04-04' })
  })

  it('town minimum of 14 days for pb mail moves due to 2027-03-31', () => {
    expect(
      plan('nh.pb.notice_req.mail', '2027-04-14', { townLeadDays: { 'nh.pb.notice.mail': 14 } })
        ?.dueOn,
    ).toBe('2027-03-31')
  })

  it('public posting is the default and the town may choose a newspaper', () => {
    expect(plan('nh.pb.notice_req.public', '2027-04-14')?.channel).toBe('public_posting')
    expect(
      plan('nh.pb.notice_req.public', '2027-04-14', { publicChoice: 'newspaper' })?.channel,
    ).toBe('newspaper')
  })

  it('a choice outside the rule options falls back to the first option', () => {
    expect(
      plan('nh.pb.notice_req.public', '2027-04-14', { publicChoice: 'website' as never })?.channel,
    ).toBe('public_posting')
  })
})
