import { createHash } from 'node:crypto'
import { NH_PACK_MANIFEST } from '@packs/nh/manifest'
import { describe, expect, it } from 'vitest'
import { canonicalJson, packInfo } from '@/features/packs/packInfo'

describe('packInfo', () => {
  it('reports the nh manifest identity', () => {
    const info = packInfo()
    expect(info.id).toBe('nh')
    expect(info.version).toBe(NH_PACK_MANIFEST.version)
    expect(NH_PACK_MANIFEST.rules.length).toBeGreaterThan(0)
  })

  it('hashes the canonical JSON with SHA-256', () => {
    const expected = createHash('sha256').update(canonicalJson(NH_PACK_MANIFEST)).digest('hex')
    expect(packInfo().hash).toBe(expected)
    expect(packInfo().hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('canonicalises key order and nesting', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}',
    )
  })
})

describe('packInfo hash', () => {
  it('packInfo hash changes when a rule label changes', () => {
    const before = packInfo().hash
    const rule = NH_PACK_MANIFEST.rules[0]
    if (rule === undefined) throw new Error('no rules')
    const originalLabel = rule.label
    ;(rule as { label: string }).label = `${originalLabel} edited`
    try {
      expect(packInfo().hash).not.toBe(before)
    } finally {
      ;(rule as { label: string }).label = originalLabel
    }
  })
})
