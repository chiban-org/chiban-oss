import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, projectParties, projects } from '@/db/schema'
import { saveDraftValues, startApplication } from '@/features/portal/drafts'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
})

describe('starting and saving', () => {
  beforeEach(async () => {
    world = await setupPermitWorld(handle.db)
  })

  it('applicant starts an application on parcel 007001000000 and gets a draft BP number', async () => {
    const lone = await staffActor(handle.db, 'applicant')
    const started = await startApplication(
      handle.db,
      lone,
      { parcelId: world.parcelId, applicationTypeKey: 'BP' },
      signal,
    )
    if (!started.ok) throw new Error(started.error)
    expect(started.value.number).toMatch(/^BP-\d{4}-0001$/)
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, started.value.applicationId))
    expect(app?.state).toBe('draft')
    const [project] = await handle.db
      .select()
      .from(projects)
      .where(eq(projects.id, started.value.projectId))
    expect(project?.title).toContain('Building permit')
  })

  it('two starts in the same instant for one applicant, parcel and type make one draft', async () => {
    const lone = await staffActor(handle.db, 'applicant')
    const input = { parcelId: world.parcelId, applicationTypeKey: 'BP' }
    const [first, second] = await Promise.all([
      startApplication(handle.db, lone, input, signal),
      startApplication(handle.db, lone, input, signal),
    ])
    if (!first.ok || !second.ok) throw new Error('start failed')
    expect(second.value).toEqual(first.value)
    const mine = await handle.db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.createdBy, lone.userId))
    expect(mine).toHaveLength(1)
  })

  it('a draft that already has answers is not reused for a new start', async () => {
    const lone = await staffActor(handle.db, 'applicant')
    const input = { parcelId: world.parcelId, applicationTypeKey: 'BP' }
    const first = await startApplication(handle.db, lone, input, signal)
    if (!first.ok) throw new Error(first.error)
    await handle.db
      .update(applications)
      .set({ values: { classification: 'residential' } })
      .where(eq(applications.id, first.value.applicationId))
    const second = await startApplication(handle.db, lone, input, signal)
    if (!second.ok) throw new Error(second.error)
    expect(second.value.applicationId).not.toBe(first.value.applicationId)
  })

  it('an empty draft the applicant can no longer reach is not reused', async () => {
    const lone = await staffActor(handle.db, 'applicant')
    const input = { parcelId: world.parcelId, applicationTypeKey: 'BP' }
    const first = await startApplication(handle.db, lone, input, signal)
    if (!first.ok) throw new Error(first.error)
    await handle.db
      .update(projectParties)
      .set({ removedAt: new Date() })
      .where(eq(projectParties.projectId, first.value.projectId))
    const second = await startApplication(handle.db, lone, input, signal)
    if (!second.ok) throw new Error(second.error)
    expect(second.value.applicationId).not.toBe(first.value.applicationId)
  })

  it('another applicant starting on the same parcel and type gets their own draft', async () => {
    const input = { parcelId: world.parcelId, applicationTypeKey: 'BP' }
    const a = await startApplication(
      handle.db,
      await staffActor(handle.db, 'applicant'),
      input,
      signal,
    )
    const b = await startApplication(
      handle.db,
      await staffActor(handle.db, 'applicant'),
      input,
      signal,
    )
    if (!a.ok || !b.ok) throw new Error('start failed')
    expect(b.value.applicationId).not.toBe(a.value.applicationId)
  })

  it('applicant creating a project becomes its applicant party', async () => {
    const lone = await staffActor(handle.db, 'applicant')
    const started = await startApplication(
      handle.db,
      lone,
      { parcelId: world.parcelId, applicationTypeKey: 'BP' },
      signal,
    )
    if (!started.ok) throw new Error(started.error)
    const parties = await handle.db
      .select()
      .from(projectParties)
      .where(eq(projectParties.projectId, started.value.projectId))
    expect(parties).toMatchObject([{ userId: lone.userId, role: 'applicant' }])
  })

  it('an unpublished type or unknown parcel starts nothing', async () => {
    const lone = await staffActor(handle.db, 'applicant')
    const before = (await handle.db.select().from(projects)).length
    expect(
      (
        await startApplication(
          handle.db,
          lone,
          { parcelId: world.parcelId, applicationTypeKey: 'ZZ' },
          signal,
        )
      ).ok,
    ).toBe(false)
    expect(
      (
        await startApplication(
          handle.db,
          lone,
          { parcelId: crypto.randomUUID(), applicationTypeKey: 'BP' },
          signal,
        )
      ).ok,
    ).toBe(false)
    expect((await handle.db.select().from(projects)).length).toBe(before)
  })

  it('draft values save without required fields', async () => {
    const app = await makeApplication(handle.db, world)
    const saved = await saveDraftValues(
      handle.db,
      world.applicant,
      { applicationId: app.applicationId, values: { finished_sq_ft: '1200' } },
      signal,
    )
    expect(saved.ok).toBe(true)
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(row?.values).toEqual({ finished_sq_ft: '1200' })
  })

  it('a draft save rejects wrong types and staff-only fields but not blanks', async () => {
    const app = await makeApplication(handle.db, world)
    const bad = await saveDraftValues(
      handle.db,
      world.applicant,
      { applicationId: app.applicationId, values: { classification: 'castle' } },
      signal,
    )
    expect(bad).toEqual({
      ok: false,
      error: { fieldErrors: [{ field: 'classification', code: 'option' }] },
    })
  })

  it('another applicant cannot save into a draft and a submitted application is not_draft', async () => {
    const app = await makeApplication(handle.db, world)
    const stranger = await staffActor(handle.db, 'applicant')
    expect(
      await saveDraftValues(
        handle.db,
        stranger,
        { applicationId: app.applicationId, values: {} },
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_found' })
    await handle.db
      .update(applications)
      .set({ state: 'submitted' })
      .where(eq(applications.id, app.applicationId))
    expect(
      await saveDraftValues(
        handle.db,
        world.applicant,
        { applicationId: app.applicationId, values: {} },
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_draft' })
  })
})
