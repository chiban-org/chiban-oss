import { describe, expect, it } from 'vitest'
import { CONFIG_KINDS, CONFIG_SCHEMAS } from '@/features/config/kinds'
import { skeletonBody } from '@/features/config/skeletons'

describe('skeletonBody', () => {
  it.each(CONFIG_KINDS)('the new %s skeleton passes its schema', (kind) => {
    const key = kind === 'town_rule_setting' ? 'town.bp.validity' : 'new-item'
    expect(CONFIG_SCHEMAS[kind].safeParse(skeletonBody(kind, key)).success).toBe(true)
  })

  it('carries the chosen key into the body', () => {
    expect(skeletonBody('form', 'my-form')).toMatchObject({ key: 'my-form' })
    expect(skeletonBody('town_rule_setting', 'town.bp.validity')).toMatchObject({
      ruleKey: 'town.bp.validity',
    })
  })
})
