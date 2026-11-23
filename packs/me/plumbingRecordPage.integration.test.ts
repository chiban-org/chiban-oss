import { ME_STARTERS } from '@packs/me/starters'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadRecordsData } from '@/app/(staff)/staff/applications/[applicationId]/recordsData'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffWith } from '@/test/staffUsers'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const RECEIVED = '2027-03-01' as CivilDate
let handle: TestDb
let world: PermitWorld
let plumber: Actor

async function recordFlags(actor: Actor, typeKey: string) {
  const made = await makeApplication(
    handle.db,
    world,
    { state: 'submitted', receivedDate: RECEIVED },
    NOW,
    typeKey,
  )
  const records = await loadRecordsData(
    { db: handle.db, actor, signal },
    made.applicationId,
    world.projectId,
  )
  return {
    file: records.canFileItems,
    accept: records.canAcceptItems,
    manage: records.canManageDocuments,
  }
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  setActivePackForTest(ME_PACK)
  for (const starter of ME_STARTERS) {
    const adopted = await adoptStarter(handle.db, world.admin, starter.id, signal)
    expect(adopted.ok ? 'ok' : adopted.error, starter.id).toBe('ok')
  }
  plumber = await staffWith(handle.db, ['plumbing_inspector'])
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('required documents on the staff record page of a plumbing permit', () => {
  it('a plumbing inspector may upload and accept on a subsurface wastewater permit and nothing more', async () => {
    expect(await recordFlags(plumber, 'SSW')).toEqual({ file: true, accept: true, manage: false })
  })

  it('a plumbing inspector may not upload or accept on a building permit', async () => {
    expect(await recordFlags(plumber, 'BP')).toEqual({ file: false, accept: false, manage: false })
  })

  it('land use staff keep upload and accept on both', async () => {
    expect(await recordFlags(world.staff, 'SSW')).toEqual({
      file: true,
      accept: true,
      manage: true,
    })
    expect(await recordFlags(world.staff, 'BP')).toEqual({ file: true, accept: true, manage: true })
  })
})
