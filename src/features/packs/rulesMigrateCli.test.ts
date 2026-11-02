import { describe, expect, it } from 'vitest'
import { parseRulesMigrateArgs } from '@/features/packs/rulesMigrateCli'

describe('rules:migrate arguments', () => {
  it('accepts --preview and --apply', () => {
    expect(parseRulesMigrateArgs(['--preview'])).toEqual({ ok: true, value: 'preview' })
    expect(parseRulesMigrateArgs(['--apply'])).toEqual({ ok: true, value: 'apply' })
  })

  it('refuses no mode, both modes, and unknown flags', () => {
    expect(parseRulesMigrateArgs([]).ok).toBe(false)
    expect(parseRulesMigrateArgs(['--preview', '--apply']).ok).toBe(false)
    expect(parseRulesMigrateArgs(['--force']).ok).toBe(false)
  })
})
