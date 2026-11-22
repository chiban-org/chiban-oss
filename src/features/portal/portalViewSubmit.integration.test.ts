import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationSnapshots, notificationOutbox } from '@/db/schema'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { startClocksFor } from '@/features/clocks/startClocks'
import { startApplication } from '@/features/portal/drafts'
import { getPortalApplicationView } from '@/features/portal/portalView'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
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

  it('the decision date reads in plain words, without statute citations, and says late only when it is', async () => {
    const dueText = async (completedOn: string) => {
      const app = await makeApplication(handle.db, world, {
        state: 'under_review',
        facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
      })
      await handle.db.transaction((tx) =>
        startClocksFor(
          tx,
          app.applicationId,
          'application_completed',
          completedOn as CivilDate,
          signal,
        ),
      )
      const view = await getPortalApplicationView(
        handle.db,
        world.applicant,
        app.applicationId,
        signal,
      )
      if (!view.ok) throw new Error('view')
      return view.value.decisionDue
    }
    const ahead = await dueText('2099-01-01')
    expect(ahead).toEqual({ date: '2099-01-31', late: false })
    const late = await dueText('2020-01-01')
    expect(late?.late).toBe(true)
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
    expect(view.value.record).toMatchObject({ mayEnd: true, board: false, receivedDate: null })
    expect(view.value.record.projectTitle).not.toBe('')
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
