import { ME_PACK } from '@packs/me'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applicationConditions } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { loadInspectionRecord } from '@/features/inspections/inspectionRecord'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { INSPECTION_NOW, scheduledInspection } from '@/test/inspectionFixtures'
import { staffWith } from '@/test/staffUsers'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let inspector: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  setActivePackForTest(ME_PACK)
  const adopted = await adoptStarter(handle.db, world.admin, 'me.starter.shoreland', signal)
  if (!adopted.ok) throw new Error(JSON.stringify(adopted.error))
  inspector = await staffWith(handle.db, ['inspector'])
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('conditions on the inspection record', () => {
  it('a shoreland start of work inspection lists the unmet conditions and leaves out the met ones', async () => {
    const permit = await makeApplication(
      handle.db,
      world,
      { state: 'issued', issuedOn: '2027-06-20' },
      INSPECTION_NOW,
      'SLZ',
    )
    await handle.db.insert(applicationConditions).values([
      {
        applicationId: permit.applicationId,
        code: 'BUFFER',
        textSnapshot: 'Keep the vegetated buffer along Alder Pond in place',
        blocksIssuance: false,
        status: 'unmet',
        changedBy: world.staff.userId,
      },
      {
        applicationId: permit.applicationId,
        code: 'SILT',
        textSnapshot: 'Install silt fence before any soil is moved',
        blocksIssuance: false,
        status: 'unmet',
        changedBy: world.staff.userId,
      },
      {
        applicationId: permit.applicationId,
        code: 'SURVEY',
        textSnapshot: 'Survey of the high water line on file',
        blocksIssuance: false,
        status: 'met',
        changedBy: world.staff.userId,
      },
    ])
    const id = await scheduledInspection(
      handle.db,
      inspector,
      permit.applicationId,
      'start_of_work',
    )
    const record = await loadInspectionRecord(handle.db, inspector, id, signal, INSPECTION_NOW)
    if (!record.ok) throw new Error(record.error)
    expect(record.value.conditions).toEqual([
      'Keep the vegetated buffer along Alder Pond in place',
      'Install silt fence before any soil is moved',
    ])
  })
})
