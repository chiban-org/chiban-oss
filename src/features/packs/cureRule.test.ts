import { describe, expect, it } from 'vitest'
import { PackManifestSchema } from '@/features/packs/schema'
import { XX_CURE } from '@/test/packs/xx/cure'
import { xxPackWith } from '@/test/packs/xx/variants'

function issues(rules: unknown[]): string[] {
  const parsed = PackManifestSchema.safeParse({ ...XX_CURE.manifest, rules })
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message)
}

const RULES = XX_CURE.manifest.rules

function withRule(patch: Record<string, unknown>) {
  return RULES.map((r) => (r.kind === 'cure_notice' ? { ...r, ...patch } : r))
}

describe('the cure notice rule in a pack manifest', () => {
  it('accepts a cure rule that names an action_due clock started by cure_notice_sent', () => {
    expect(issues(RULES)).toEqual([])
  })

  it('rejects a cureRuleKey that is not a clock', () => {
    expect(issues(withRule({ cureRuleKey: 'xx.enf.penalty' })).join(' ')).toContain('cureRuleKey')
  })

  it('rejects a cureRuleKey whose clock starts on another event', () => {
    expect(issues(withRule({ cureRuleKey: 'xx.enf.answer' })).join(' ')).toContain('cureRuleKey')
  })

  it('rejects a penaltyRuleKey that is not a civil penalty', () => {
    expect(issues(withRule({ penaltyRuleKey: 'xx.enf.cure_period' })).join(' ')).toContain(
      'penaltyRuleKey',
    )
  })

  it('accepts a null penaltyRuleKey', () => {
    expect(issues(withRule({ penaltyRuleKey: null }))).toEqual([])
  })

  it('leaves the base fictional pack without a cure rule', () => {
    expect(xxPackWith({}).manifest.rules.some((r) => r.kind === 'cure_notice')).toBe(false)
  })
})
