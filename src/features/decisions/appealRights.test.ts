import { describe, expect, it } from 'vitest'
import { appealRightsFor } from '@/features/decisions/appealRights'

describe('appealRightsFor', () => {
  it('a variance cites the RSA 677:2 rehearing right', () => {
    expect(appealRightsFor('nh.zba_variance')).toBe(
      'A party or person directly affected may move for rehearing within 30 days after the vote (RSA 677:2).',
    )
  })

  it('a site plan cites the RSA 677:15 court petition', () => {
    expect(appealRightsFor('nh.pb_site_plan')).toBe(
      'An aggrieved party may petition the superior court within 30 days after the vote (RSA 677:15).',
    )
  })

  it('a building permit has no board appeal copy', () => {
    expect(appealRightsFor('nh.building_permit')).toBe('')
  })

  it('an unknown classification has no copy', () => {
    expect(appealRightsFor('nh.unknown')).toBe('')
  })
})
