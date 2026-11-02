import { NH_STARTERS } from '@packs/nh/starters'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configVersions } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { applyStarterPaths } from '@/features/config/applyStarterPaths'
import { publishConfig } from '@/features/config/publish'
import { loadStarterReviews } from '@/features/config/starterReview'
import { saveDraft } from '@/features/config/store'
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

async function townRate() {
  const fees = structuredClone(starter().feeSchedule)
  const sum = (fees.lines[0]?.expr as { of: { of: { of: { centsPerUnit: number }[] } } }).of.of
  const first = sum.of[0]
  if (first === undefined) throw new Error('shape')
  first.centsPerUnit = 50
  const saved = await saveDraft(
    handle.db,
    admin,
    { kind: 'fee_schedule', key: 'bp-fees', body: fees },
    signal,
  )
  if (!saved.ok) throw new Error(JSON.stringify(saved.error))
  const published = await publishConfig(handle.db, admin, saved.value.versionId, signal)
  if (!published.ok) throw new Error(JSON.stringify(published.error))
}

async function simulateUpstreamBump() {
  await handle.db
    .update(configVersions)
    .set({ upstreamTemplateVersion: 0 })
    .where(eq(configVersions.upstreamTemplateId, STARTER_ID))
}

describe('loadStarterReviews', () => {
  it('lists no bundle when every adopted starter is at the upstream version', async () => {
    expect(await loadStarterReviews(handle.db, signal)).toEqual([])
  })

  it('after an upstream bump only members that differ are listed, and the bundle clears once the last difference is applied', async () => {
    await townRate()
    await simulateUpstreamBump()
    const before = await loadStarterReviews(handle.db, signal)
    expect(before).toHaveLength(1)
    expect(before[0]?.members.map((m) => `${m.kind}:${m.key}`)).toEqual(['fee_schedule:bp-fees'])
    expect(before[0]?.members[0]?.label).toBe('Building or demolition permit')
    const applied = await applyStarterPaths(
      handle.db,
      admin,
      { kind: 'fee_schedule', key: 'bp-fees', paths: [RATE_PATH] },
      signal,
    )
    expect(applied.ok).toBe(true)
    expect(await loadStarterReviews(handle.db, signal)).toEqual([])
  })
})
