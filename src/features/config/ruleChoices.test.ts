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

describe('pack rule choices', () => {
  it('no two offered rules share a label', () => {
    const labels = editorContext().packRules.map((r) => r.label)
    expect(labels.filter((label, i) => labels.indexOf(label) !== i)).toEqual([])
  })

  it('tells same-named rules apart by citation', () => {
    const labels = editorContext().packRules.map((r) => r.label)
    expect(labels).toContain('Answer to a cease and desist order (RSA 676:17-a V)')
    expect(labels).toContain('Answer to a cease and desist order (RSA 155-A:8-b V)')
  })
})
