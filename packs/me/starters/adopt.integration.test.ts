import { ME_PACK } from '@packs/me'
import { ME_STARTERS } from '@packs/me/starters'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adoptStarter } from '@/features/config/adoptStarter'
import { pinCurrent } from '@/features/config/bindings'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  setActivePackForTest(ME_PACK)
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('adopting the Maine starters', () => {
  it('publishes every Maine starter and pins each application type', async () => {
    expect(ME_STARTERS).toHaveLength(12)
    const admin = await staffActor(handle.db, 'admin')
    for (const starter of ME_STARTERS) {
      const adopted = await adoptStarter(handle.db, admin, starter.id, signal)
      expect(adopted.ok ? 'ok' : adopted.error, starter.id).toBe('ok')
      const pinned = await pinCurrent(handle.db, starter.applicationType.key, signal)
      expect(pinned.ok, starter.id).toBe(true)
    }
  })
})
