import { describe, expect, it } from 'vitest'
import { requirementsFor } from '@/features/notices/requirementsFor'
import { classificationOf } from '@/features/packs/probes/probe'

const keys = (classification: string, regionalImpact: boolean, desWithin: boolean) =>
  requirementsFor(classificationOf(classification), { regionalImpact, desWithin }).map((r) => r.key)

describe('requirementsFor', () => {
  it('a site plan with no flags needs verified mail and public notice', () => {
    expect(keys('nh.pb_site_plan', false, false)).toEqual([
      'nh.pb.notice_req.mail',
      'nh.pb.notice_req.public',
    ])
  })

  it('regional impact and DES proximity add their items', () => {
    expect(keys('nh.pb_site_plan', true, true)).toEqual([
      'nh.pb.notice_req.mail',
      'nh.pb.notice_req.des',
      'nh.pb.notice_req.public',
      'nh.ri.notice_req.certified',
    ])
  })

  it('a variance needs mail and newspaper, plus certified on regional impact', () => {
    expect(keys('nh.zba_variance', false, false)).toEqual([
      'nh.zba.notice_req.mail',
      'nh.zba.notice_req.newspaper',
    ])
    expect(keys('nh.zba_variance', true, false)).toContain('nh.ri.notice_req.certified')
  })

  it('a building permit needs no hearing notice', () => {
    expect(keys('nh.building_permit', true, true)).toEqual([])
  })
})
