import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog } from '@/db/schema'
import { resolveClockLength } from '@/features/clocks/startClocks'
import { retireTownRule } from '@/features/config/retireTownRule'
import { getPublished, listVersions } from '@/features/config/store'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { ClockRule } from '@/features/packs/schema'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const SETTING_KEY = 'town.bp.validity'
const CLOCK_KEY = 'town.bp.expiration'
const FACTS = { classification: null, dwellingUnits: null, afterTheFact: false }
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function clockLength() {
  const pack = loadPack()
  const rule = ruleByKey(pack, CLOCK_KEY) as ClockRule
  return await resolveClockLength(handle.db, rule, FACTS, pack, signal)
}

async function publishEighteen() {
  const admin = await staffActor(handle.db, 'admin')
  await saveAndPublish(handle.db, admin, 'town_rule_setting', SETTING_KEY, {
    ruleKey: SETTING_KEY,
    value: 18,
    adoptingAuthority: 'Town Meeting',
    adoptedOn: '2027-03-10',
  })
  return admin
}

describe('retire a town rule', () => {
  it('returns the rule to its starting value with an audit row', async () => {
    const admin = await publishEighteen()
    expect(await clockLength()).toMatchObject({ value: 18, source: 'town_setting' })
    const retired = await retireTownRule(handle.db, admin, SETTING_KEY, signal)
    expect(retired.ok).toBe(true)
    expect(await clockLength()).toMatchObject({ value: 12, source: 'pack_rule' })
    expect(await getPublished(handle.db, 'town_rule_setting', SETTING_KEY, signal)).toBeNull()
    const versions = await listVersions(handle.db, 'town_rule_setting', SETTING_KEY, signal)
    expect(versions.map((v) => v.status)).toEqual(['superseded'])
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'config.retire_town_rule'))
    expect(audits).toHaveLength(1)
  })

  it('refuses when no value is in use', async () => {
    const admin = await staffActor(handle.db, 'admin')
    expect(await retireTownRule(handle.db, admin, SETTING_KEY, signal)).toEqual({
      ok: false,
      error: 'not_published',
    })
  })

  it('refuses someone who may not change settings', async () => {
    await publishEighteen()
    const staff = await staffActor(handle.db, 'staff')
    expect(await retireTownRule(handle.db, staff, SETTING_KEY, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})
