import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applicationSnapshots,
  applications,
  notificationOutbox,
  projectParties,
  projects,
} from '@/db/schema'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { type Actor, loadActor } from '@/features/auth/actor'
import { claimProject, sendContractorClaim } from '@/features/contractors/claims'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { saveDraftValues, startApplication } from '@/features/portal/drafts'
import { getPortalApplicationView } from '@/features/portal/portalView'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { submittedTrade } from '@/test/ledgerFixtures'
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

describe('portal view', () => {
  beforeEach(async () => {
    world = await setupPermitWorld(handle.db, { starters: ['nh.starter.electrical'] })
  })

  it("another applicant's application page is not_found", async () => {
    const app = await makeApplication(handle.db, world)
    const stranger = await staffActor(handle.db, 'applicant')
    expect(await getPortalApplicationView(handle.db, stranger, app.applicationId, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(
      await getPortalApplicationView(handle.db, world.applicant, 'not-a-uuid', signal),
    ).toEqual({ ok: false, error: 'not_found' })
  })

  it('shows a draft with its form, can edit, and nothing to pay', async () => {
    const app = await makeApplication(handle.db, world)
    const view = await getPortalApplicationView(
      handle.db,
      world.applicant,
      app.applicationId,
      signal,
    )
    if (!view.ok) throw new Error('view')
    expect(view.value).toMatchObject({
      number: app.number,
      state: 'draft',
      canEdit: true,
      canPay: false,
    })
    expect(view.value.form?.fields.length).toBeGreaterThan(0)
    expect(view.value.attestationText).toBe(appTypeBody().attestationText)
    expect(view.value.fees.dueCents).toBe(0)
  })

  it('never lists staff-only form fields', async () => {
    const app = await makeApplication(handle.db, world)
    const view = await getPortalApplicationView(
      handle.db,
      world.applicant,
      app.applicationId,
      signal,
    )
    if (!view.ok) throw new Error('view')
    expect(view.value.form?.fields.some((f) => f.staffOnly === true)).toBe(false)
  })

  it('canPay is true when a fee is due on a submitted trade permit, and the viewer is a payer party', async () => {
    const trade = await submittedTrade(handle.db, world)
    const view = await getPortalApplicationView(
      handle.db,
      world.applicant,
      trade.applicationId,
      signal,
    )
    if (!view.ok) throw new Error('view')
    expect(view.value.fees.dueCents).toBeGreaterThan(0)
    expect(view.value.canPay).toBe(true)
    expect(view.value.canEdit).toBe(false)
    expect(view.value.canUpload).toBe(true)
  })

  it('a reviewer party-less viewer sees no payment control', async () => {
    const trade = await submittedTrade(handle.db, world)
    const inspector = await staffActor(handle.db, 'inspector')
    const view = await getPortalApplicationView(handle.db, inspector, trade.applicationId, signal)
    if (!view.ok) throw new Error('view')
    expect(view.value.canPay).toBe(false)
    expect(view.value.canEdit).toBe(false)
  })

  it('contractor party sees status after claiming and cannot edit a submitted application', async () => {
    const trade = await submittedTrade(handle.db, world)
    const mail = createMemoryTransport()
    await sendContractorClaim(
      handle.db,
      mail,
      world.staff,
      { projectId: world.projectId, email: 'pat@alderpond.example', name: 'Pat' },
      signal,
    )
    const id = await makeUser(handle.db, { role: 'contractor', email: 'pat@alderpond.example' })
    const contractor = (await loadActor(handle.db, id, signal)) as Actor
    expect(
      await getPortalApplicationView(handle.db, contractor, trade.applicationId, signal),
    ).toEqual({ ok: false, error: 'not_found' })
    const token = /\/claim\/([A-Za-z0-9_-]+)/.exec(mail.sent[0]?.text ?? '')?.[1] ?? ''
    await claimProject(handle.db, contractor, token, signal)
    const view = await getPortalApplicationView(handle.db, contractor, trade.applicationId, signal)
    if (!view.ok) throw new Error('view')
    expect(view.value.state).toBe('submitted')
    expect(view.value.stateLabel).toBe('Submitted')
    expect(view.value.canPay).toBe(true)
  })
})

describe('submit', () => {
  it('submit creates a snapshot and queues application_submitted (confirmed through the portal start path)', async () => {
    world = await setupPermitWorld(handle.db)
    const lone = await staffActor(handle.db, 'applicant')
    const started = await startApplication(
      handle.db,
      lone,
      { parcelId: world.parcelId, applicationTypeKey: 'BP' },
      signal,
    )
    if (!started.ok) throw new Error(started.error)
    const done = await submitApplication(
      handle.db,
      lone,
      {
        applicationId: started.value.applicationId,
        values: { classification: 'residential' },
        attestation: { statementSha256: attestationHash(appTypeBody().attestationText) },
      },
      signal,
    )
    expect(done.ok).toBe(true)
    expect(await handle.db.select().from(applicationSnapshots)).toHaveLength(1)
    expect((await handle.db.select().from(notificationOutbox)).map((r) => r.event)).toEqual([
      'application_submitted',
    ])
  })
})
