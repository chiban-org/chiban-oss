import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runRulesMigrate } from '@/features/packs/rulesMigrateCli'
import type { RuleTransition } from '@/features/packs/ruleTransitions'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
})

const TRANSITIONS: RuleTransition[] = [
  {
    id: 'nh-1',
    ruleKey: 'nh.bp.decision',
    fromVersion: 1,
    toVersion: 1,
    policy: 'keep_old',
    reason: 'Fixture',
  },
]

describe('runRulesMigrate', () => {
  it('reports that nothing is pending when no transition is declared', async () => {
    const lines: string[] = []
    await runRulesMigrate(handle.db, 'preview', [], (l) => lines.push(l), signal)
    expect(lines).toEqual(['No rule transitions are declared.'])
  })

  it('previews a declared transition without applying it, then applies it once', async () => {
    const lines: string[] = []
    await runRulesMigrate(handle.db, 'preview', TRANSITIONS, (l) => lines.push(l), signal)
    expect(lines.join('\n')).toContain('nh-1: 0 running clocks affected (keep_old)')
    const applied: string[] = []
    await runRulesMigrate(handle.db, 'apply', TRANSITIONS, (l) => applied.push(l), signal)
    expect(applied.join('\n')).toContain('nh-1: applied, 0 affected')
    const again: string[] = []
    await runRulesMigrate(handle.db, 'apply', TRANSITIONS, (l) => again.push(l), signal)
    expect(again.join('\n')).toContain('nh-1: already applied')
  })
})
