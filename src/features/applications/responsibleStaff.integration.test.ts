import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications, auditLog, users } from '@/db/schema'
import {
  listResponsibleChoices,
  responsibleStaffOf,
  setResponsibleStaff,
} from '@/features/applications/responsibleStaff'
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

async function responsibleColumn(applicationId: string) {
  const [row] = await handle.db
    .select({ id: applications.responsibleUserId })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.id ?? null
}

describe('responsible staff on an application', () => {
  it('lets staff hand an application to a colleague and records who did it', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'submitted' })
    const planner = await staffActor(handle.db, 'staff')
    const result = await setResponsibleStaff(
      handle.db,
      world.staff,
      { applicationId, userId: planner.userId },
      signal,
    )
    expect(result.ok).toBe(true)
    expect(await responsibleColumn(applicationId)).toBe(planner.userId)
    expect((await responsibleStaffOf(handle.db, applicationId))?.userId).toBe(planner.userId)
    const audits = await handle.db
      .select({ before: auditLog.before, after: auditLog.after })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, applicationId),
          eq(auditLog.action, 'application.responsible_staff'),
        ),
      )
    expect(audits).toEqual([
      { before: { responsibleUserId: null }, after: { responsibleUserId: planner.userId } },
    ])
  })

  it('clears the responsible staff member', async () => {
    const { applicationId } = await makeApplication(handle.db, world, {
      state: 'submitted',
      responsibleUserId: world.staff.userId,
    })
    const result = await setResponsibleStaff(
      handle.db,
      world.staff,
      { applicationId, userId: null },
      signal,
    )
    expect(result.ok).toBe(true)
    expect(await responsibleColumn(applicationId)).toBeNull()
  })

  it('refuses a reviewer, an applicant and a disabled account as responsible staff', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'submitted' })
    const disabled = await staffActor(handle.db, 'staff')
    await handle.db.update(users).set({ isActive: false }).where(eq(users.id, disabled.userId))
    for (const userId of [world.reviewer.userId, world.applicant.userId, disabled.userId]) {
      const result = await setResponsibleStaff(
        handle.db,
        world.staff,
        { applicationId, userId },
        signal,
      )
      expect(result).toEqual({ ok: false, error: 'not_staff' })
    }
    expect(await responsibleColumn(applicationId)).toBeNull()
  })

  it('refuses someone without application.manage', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'submitted' })
    const inspector = await staffActor(handle.db, 'inspector')
    const result = await setResponsibleStaff(
      handle.db,
      inspector,
      { applicationId, userId: inspector.userId },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(await responsibleColumn(applicationId)).toBeNull()
  })

  it('offers active staff-side accounts and leaves out reviewers and applicants', async () => {
    const choices = await listResponsibleChoices(handle.db)
    const ids = choices.map((c) => c.id)
    expect(ids).toContain(world.staff.userId)
    expect(ids).toContain(world.admin.userId)
    expect(ids).not.toContain(world.reviewer.userId)
    expect(ids).not.toContain(world.applicant.userId)
  })
})
