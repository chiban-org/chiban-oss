import { ME_PACK } from '@packs/me'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resolveClockLength } from '@/features/clocks/startClocks'
import { editorContext, isSettableTownRule } from '@/features/config/editorContext'
import { publishConfig } from '@/features/config/publish'
import { saveDraft } from '@/features/config/store'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ClockRule } from '@/features/packs/schema'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const RULE_KEY = 'me.pb.hearing_notice_first'
const FACTS = { classification: null, dwellingUnits: null, afterTheFact: false }
let handle: TestDb

beforeAll(() => setActivePackForTest(ME_PACK))
afterAll(() => setActivePackForTest(null))
beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function publishValue(value: number) {
  const admin = await staffActor(handle.db, 'admin')
  const saved = await saveDraft(
    handle.db,
    admin,
    {
      kind: 'town_rule_setting',
      key: RULE_KEY,
      body: {
        ruleKey: RULE_KEY,
        value,
        adoptingAuthority: 'Planning Board',
        adoptedOn: '2027-01-12',
      },
    },
    signal,
  )
  if (!saved.ok) throw new Error('draft refused')
  return await publishConfig(handle.db, admin, saved.value.versionId, signal)
}

async function leadDays(): Promise<number> {
  const pack = loadPack()
  const rule = ruleByKey(pack, RULE_KEY) as ClockRule
  const length = await resolveClockLength(handle.db, rule, FACTS, pack, signal)
  return length.value
}

describe('a town value for a bounded clock', () => {
  it('makes the notice lead the town value', async () => {
    expect(await leadDays()).toBe(7)
    expect((await publishValue(10)).ok).toBe(true)
    expect(await leadDays()).toBe(10)
  })

  it('refuses a value below the floor', async () => {
    const result = await publishValue(5)
    expect(result.ok).toBe(false)
    expect(await leadDays()).toBe(7)
  })

  it('lists the clock among the rules a town can set, with its floor as the minimum', () => {
    const rule = ruleByKey(loadPack(), RULE_KEY)
    expect(isSettableTownRule(rule)).toBe(true)
    expect(editorContext().townRules[RULE_KEY]).toMatchObject({ unit: 'days', min: 7, max: 365 })
  })
})
