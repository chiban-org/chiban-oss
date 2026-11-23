import { ME_PACK } from '@packs/me'
import { NH_PACK } from '@packs/nh'
import { describe, expect, it } from 'vitest'
import { appealRightsFromRoutes } from '@/features/decisions/appealRights'
import { withPackForTest } from '@/features/packs/registry'

const RECONSIDER =
  'Request to the Board of Appeals to reconsider its decision: within 10 days after the vote (30-A MRSA §2691(3)(F)).'
const COURT =
  'Court appeal of a Board of Appeals decision: within 45 days after the vote (30-A MRSA §2691(3)(G), (H)).'
const AFTER_RECONSIDERATION =
  'Court appeal of a reconsidered Board of Appeals decision: within 15 days after the decision on reconsideration (30-A MRSA §2691(3)(F), (H)).'
const REFUSED =
  'If reconsideration refused: Court appeal of a Board of Appeals decision, within 45 days after the vote (30-A MRSA §2691(3)(G), (H)).'

function sentencesOf(text: string): string[] {
  return text.split(/(?<=\)\.)\s/)
}

describe('appeal rights stated from the pack routes', () => {
  it('a Board of Appeals denial states the reconsideration and court windows', () => {
    const text = withPackForTest(ME_PACK, () =>
      appealRightsFromRoutes('zba_decision', 'denied', null),
    )
    expect(sentencesOf(text)).toEqual([COURT, RECONSIDER, AFTER_RECONSIDERATION, REFUSED])
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}|20\d\d/)
  })

  it('a Board of Appeals approval adds the last municipal approval windows', () => {
    const text = withPackForTest(ME_PACK, () =>
      appealRightsFromRoutes('zba_decision', 'approved', null),
    )
    const sentences = sentencesOf(text)
    expect(sentences).toContain(COURT)
    expect(sentences).toContain(RECONSIDER)
    expect(sentences).toContain(
      'If the planning board gave the last municipal approval: Court appeal of a Board of Appeals approval after the planning board approves last, within 30 days after the project has its last municipal approval (30-A MRSA §2691(3); §4482-A(1)).',
    )
    expect(sentences.filter((s) => s.includes('last municipal approval'))).toHaveLength(2)
    expect(sentences).toHaveLength(6)
  })

  it('a significant Planning Board approval states only the significant route', () => {
    const text = withPackForTest(ME_PACK, () =>
      appealRightsFromRoutes('pb_decision', 'approved', true),
    )
    expect(sentencesOf(text)).toEqual([
      'Court appeal of a significant approval: within 30 days after the project has its last municipal approval (30-A MRSA §4482(3); M.R. Civ. P. 80B(b)).',
    ])
  })

  it('a Planning Board approval that is not significant states the approval route', () => {
    const text = withPackForTest(ME_PACK, () =>
      appealRightsFromRoutes('pb_decision', 'approved', false),
    )
    expect(sentencesOf(text)).toEqual([
      'Court appeal of an approval: within 30 days after the project has its last municipal approval (30-A MRSA §4482-A, §4482-B).',
    ])
  })

  it('a staff decision states the administrative appeal from the town setting', () => {
    const fallback = withPackForTest(ME_PACK, () =>
      appealRightsFromRoutes('administrative_decision', 'denied', null),
    )
    expect(fallback).toBe(
      'Appeal of an administrative decision to the Board of Appeals: within 30 days after the decision (30-A MRSA §4353(1)).',
    )
    const townSet = withPackForTest(ME_PACK, () =>
      appealRightsFromRoutes(
        'administrative_decision',
        'denied',
        null,
        new Map([['me.appeal.admin_to_boa', { unit: 'days', value: 21 }]]),
      ),
    )
    expect(townSet).toContain('within 21 days after the decision')
  })

  it('a New Hampshire staff decision states the administrative appeal', () => {
    const text = withPackForTest(NH_PACK, () =>
      appealRightsFromRoutes('administrative_decision', 'approved', null),
    )
    expect(text).toBe(
      'Appeal of an administrative decision to the ZBA: within 30 days after the decision (RSA 676:5 I).',
    )
  })
})
