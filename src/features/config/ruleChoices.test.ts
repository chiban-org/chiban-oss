import { describe, expect, it } from 'vitest'
import { editorContext } from '@/features/config/editorContext'
import { ruleChoicesFor } from '@/features/config/ruleChoices'

describe('ruleChoicesFor', () => {
  it('a variance type is not offered building permit rules', () => {
    const context = editorContext()
    const variance = context.classifications.find((c) => c.key === 'nh.zba_variance')
    const keys = ruleChoicesFor(context.packRules, variance).map((r) => r.key)
    expect(keys).toContain('nh.zba.decision')
    expect(keys.filter((k) => k.startsWith('nh.bp.'))).toEqual([])
  })
})
