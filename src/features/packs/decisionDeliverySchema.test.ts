import { describe, expect, it } from 'vitest'
import { PackManifestSchema, type PackRule } from '@/features/packs/schema'
import { deliveryPack, deliveryRule, dueClock, FULL_PACK } from '@/test/deliveryFixtures'
import { XX_PACK } from '@/test/packs/xx'

describe('the pack manifest and a decision delivery rule', () => {
  it('accepts a due rule key that is an action_due clock started by the board vote', () => {
    expect(PackManifestSchema.safeParse(FULL_PACK.manifest).success).toBe(true)
  })

  it.each([
    ['an unknown key', { dueRuleKey: 'xx.zba.nothing' }],
    ['a rule that is not a clock', { dueRuleKey: 'xx.appeal.suspension' }],
    ['a clock started by another event', { dueRuleKey: 'xx.bp.decision' }],
  ])('rejects %s', (_, patch) => {
    const pack = deliveryPack({ ...deliveryRule, ...patch })
    expect(PackManifestSchema.safeParse(pack.manifest).success).toBe(false)
  })

  it('rejects a due clock that is not action_due', () => {
    const rules: PackRule[] = [
      ...XX_PACK.manifest.rules,
      { ...dueClock, clockType: 'filing_window' },
      deliveryRule,
    ]
    expect(PackManifestSchema.safeParse({ ...FULL_PACK.manifest, rules }).success).toBe(false)
  })

  it('rejects a rule that names no recipient, no method or no board kind', () => {
    for (const patch of [{ recipients: [] }, { methods: [] }, { boardKinds: [] }]) {
      const pack = deliveryPack({ ...deliveryRule, ...patch })
      expect(PackManifestSchema.safeParse(pack.manifest).success).toBe(false)
    }
  })
})
