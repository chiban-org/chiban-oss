import { describe, expect, it } from 'vitest'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { policyText } from '@/features/packs/ruleSummary'

const pack = loadPack()

describe('policyText', () => {
  it('says a clock that follows a town setting follows that setting by its label', () => {
    expect(policyText(ruleByKey(pack, 'town.bp.expiration'))).toBe(
      'Follows the town setting "Building permit validity period".',
    )
  })

  it('says a fixed rule the town cannot change is the starting rule when it is not statute', () => {
    const rule = {
      ...ruleByKey(pack, 'nh.bp.decision'),
      citation: { label: 'Town rule', url: null },
    }
    expect(policyText(rule)).toBe("Chiban's starting rule. The town cannot change it here.")
  })

  it('says a town choice of notice channel instead of a default of 0', () => {
    expect(policyText(ruleByKey(pack, 'nh.pb.notice_req.public'))).toBe(
      'The town chooses posting or newspaper.',
    )
  })

  it('keeps the statute text on a statute rule', () => {
    expect(policyText(ruleByKey(pack, 'nh.bp.decision'))).toBe(
      'Fixed by statute. The town cannot change it.',
    )
  })

  it('keeps the floor and ceiling wording', () => {
    const floor = pack.rules.find((r) => r.overridePolicy.policy === 'minimum')
    if (floor === undefined) throw new Error('no minimum rule in the pack')
    expect(policyText(floor)).toMatch(/^The town may set a value of .+ or more\.$/)
  })
})
