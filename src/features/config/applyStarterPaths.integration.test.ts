import { NH_STARTERS } from '@packs/nh/starters'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configVersions } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { applyStarterPaths } from '@/features/config/applyStarterPaths'
import { publishConfig } from '@/features/config/publish'
import { getPublished, saveDraft } from '@/features/config/store'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const STARTER_ID = 'nh.starter.building'
const RATE_PATH = '/lines/0/expr/of/of/of/0/centsPerUnit'
let handle: TestDb
let admin: Actor

function starter() {
  const found = NH_STARTERS.find((s) => s.id === STARTER_ID)
  if (found === undefined) throw new Error('missing starter')
  return found
}

async function publishBody(kind: 'fee_schedule' | 'application_type', key: string, body: unknown) {
  const saved = await saveDraft(handle.db, admin, { kind, key, body }, signal)
  if (!saved.ok) throw new Error(JSON.stringify(saved.error))
  const published = await publishConfig(handle.db, admin, saved.value.versionId, signal)
  if (!published.ok) throw new Error(JSON.stringify(published.error))
}

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  const adopted = await adoptStarter(handle.db, admin, STARTER_ID, signal)
  if (!adopted.ok) throw new Error(JSON.stringify(adopted.error))
})
afterEach(async () => {
  await handle.drop()
})

function townFees() {
  const fees = structuredClone(starter().feeSchedule)
  const sum = (fees.lines[0]?.expr as { of: { of: { of: { centsPerUnit: number }[] } } }).of.of
  const first = sum.of[0]
  if (first === undefined) throw new Error('shape')
  first.centsPerUnit = 50
  fees.lines[1] = { ...fees.lines[1]!, label: 'Town renewal label' }
  return fees
}

describe('applyStarterPaths', () => {
  it('applying one path publishes a new version with that path changed and nothing else', async () => {
    const town = townFees()
    await publishBody('fee_schedule', 'bp-fees', town)
    const result = await applyStarterPaths(
      handle.db,
      admin,
      { kind: 'fee_schedule', key: 'bp-fees', paths: [RATE_PATH] },
      signal,
    )
    expect(result).toEqual({ ok: true, value: { version: 3 } })
    const published = await getPublished(handle.db, 'fee_schedule', 'bp-fees', signal)
    const expected = structuredClone(town)
    ;(expected.lines[0]?.expr as { of: { of: { of: { centsPerUnit: number }[] } } }).of.of
      .of[0]!.centsPerUnit = 35
    expect(published?.body).toEqual(expected)
    expect(published?.upstreamTemplateId).toBe(STARTER_ID)
    expect(published?.upstreamTemplateVersion).toBe(starter().version)
    expect(published?.version).toBe(3)
  })

  it('an unknown path is unknown_path', async () => {
    await publishBody('fee_schedule', 'bp-fees', townFees())
    const result = await applyStarterPaths(
      handle.db,
      admin,
      { kind: 'fee_schedule', key: 'bp-fees', paths: ['/lines/9/nothing'] },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'unknown_path' })
    const rows = await handle.db
      .select()
      .from(configVersions)
      .where(and(eq(configVersions.kind, 'fee_schedule'), eq(configVersions.key, 'bp-fees')))
    expect(rows).toHaveLength(2)
  })

  it('a key that was never adopted is not_adopted', async () => {
    const result = await applyStarterPaths(
      handle.db,
      admin,
      { kind: 'fee_schedule', key: 'not-a-starter-key', paths: [RATE_PATH] },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'not_adopted' })
  })

  it('staff applying is forbidden', async () => {
    await publishBody('fee_schedule', 'bp-fees', townFees())
    const staff = await staffActor(handle.db, 'staff')
    const result = await applyStarterPaths(
      handle.db,
      staff,
      { kind: 'fee_schedule', key: 'bp-fees', paths: [RATE_PATH] },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    const published = await getPublished(handle.db, 'fee_schedule', 'bp-fees', signal)
    expect(published?.version).toBe(2)
  })

  it('applied version that drops a mandatory binding is rejected like any publish', async () => {
    const town = {
      ...starter().applicationType,
      classification: 'nh.trade_permit',
      bindings: ['nh.appeal.suspension'],
    }
    await publishBody('application_type', 'BP', town)
    const result = await applyStarterPaths(
      handle.db,
      admin,
      { kind: 'application_type', key: 'BP', paths: ['/classification'] },
      signal,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatchObject({ missingBindings: expect.any(Array) })
    const published = await getPublished(handle.db, 'application_type', 'BP', signal)
    expect(published?.version).toBe(2)
    expect((published?.body as { classification: string }).classification).toBe('nh.trade_permit')
  })
})
