import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACTIVITY_LIMIT, recentApplicationActivity } from '@/features/applications/activity'
import { addApplicationNote } from '@/features/applications/notes'
import { setResponsibleStaff } from '@/features/applications/responsibleStaff'
import { writeAudit } from '@/features/audit/writeAudit'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function submitted(): Promise<string> {
  return (await makeApplication(handle.db, world, { state: 'submitted' })).applicationId
}

describe('recent activity on an application', () => {
  it('lists who did what in plain words, newest first, for this application only', async () => {
    const applicationId = await submitted()
    const other = await submitted()
    await setResponsibleStaff(
      handle.db,
      world.staff,
      { applicationId, userId: world.staff.userId },
      signal,
    )
    await addApplicationNote(handle.db, world.staff, { applicationId, body: 'Checked.' }, signal)
    await addApplicationNote(
      handle.db,
      world.staff,
      { applicationId: other, body: 'Elsewhere.' },
      signal,
    )
    await writeAudit(
      handle.db,
      {
        actor: { kind: 'system', job: 'clocks.sweep' },
        action: 'clock.tolling',
        entityType: 'application',
        entityId: applicationId,
      },
      signal,
    )
    const rows = await recentApplicationActivity(handle.db, world.staff, applicationId, signal)
    const lines = rows.map((r) => `${r.who}: ${r.what}`)
    const staffName = rows.find((r) => r.what === 'Added a staff note')?.who
    expect(staffName).toBeTruthy()
    expect(lines.slice(0, 3)).toEqual([
      'Chiban, automatically: Paused a deadline',
      `${staffName}: Added a staff note`,
      `${staffName}: Changed who is responsible`,
    ])
    expect(rows.every((r) => r.at instanceof Date)).toBe(true)
  })

  it(`keeps to the latest ${ACTIVITY_LIMIT} entries`, async () => {
    const applicationId = await submitted()
    for (let i = 0; i < ACTIVITY_LIMIT + 2; i += 1) {
      await addApplicationNote(handle.db, world.staff, { applicationId, body: `N${i}` }, signal)
    }
    const rows = await recentApplicationActivity(handle.db, world.staff, applicationId, signal)
    expect(rows).toHaveLength(ACTIVITY_LIMIT)
  })

  it('shows the activity to full-record roles and to nobody else', async () => {
    const applicationId = await submitted()
    await addApplicationNote(handle.db, world.staff, { applicationId, body: 'Noted.' }, signal)
    const inspector = await staffActor(handle.db, 'inspector')
    expect(
      (await recentApplicationActivity(handle.db, inspector, applicationId, signal)).length,
    ).toBeGreaterThan(0)
    for (const actor of [
      world.reviewer,
      await staffActor(handle.db, 'board_member'),
      world.applicant,
    ]) {
      expect(await recentApplicationActivity(handle.db, actor, applicationId, signal)).toEqual([])
    }
  })
})
